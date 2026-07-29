"""Forecasting engine.

Primary path: the foundation-model backend (zero-shot), loaded lazily.
Safety net: a transparent statistical baseline (trend + seasonal + residual
bands) used only if the primary backend cannot be loaded, so the public demo
never shows a blank screen. Which engine produced a result is ALWAYS reported
back to the client via the ``engine`` field, so results are never misattributed.

Public engine identifiers are deliberately white-labelled: the product is
presented as a proprietary in-house engine, so no upstream implementation
detail leaks through the HTTP API. Upstream attribution lives in the repository
LICENSE and source headers, which is what the Apache-2.0 terms require.
"""

from __future__ import annotations

import sys
import threading

import numpy as np

from .config import settings

# Quantile levels TimesFM returns on axis index 1..9 (index 0 is the mean).
_QLEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
# z-scores for a normal distribution at those levels (used by the fallback).
_ZSCORES = {
    0.1: -1.2816, 0.2: -0.8416, 0.3: -0.5244, 0.4: -0.2533, 0.5: 0.0,
    0.6: 0.2533, 0.7: 0.5244, 0.8: 0.8416, 0.9: 1.2816,
}

ENGINE_PRIMARY = "meridian-core"
ENGINE_BASELINE = "meridian-baseline"


def clean_series(values) -> np.ndarray:
    """Drop leading/trailing NaNs and linearly interpolate interior gaps."""
    arr = np.asarray(values, dtype=np.float64)
    finite = np.isfinite(arr)
    if not finite.any():
        return np.array([], dtype=np.float64)
    first = int(np.argmax(finite))
    last = len(arr) - int(np.argmax(finite[::-1]))
    arr = arr[first:last]
    mask = ~np.isfinite(arr)
    if mask.any():
        idx = np.arange(len(arr))
        arr[mask] = np.interp(idx[mask], idx[~mask], arr[~mask])
    return arr


class Forecaster:
    def __init__(self) -> None:
        self._model = None
        self._lock = threading.Lock()
        self._engine = "unloaded"
        self._load_error: str | None = None

    # ------------------------------------------------------------------ model
    def _ensure_model(self) -> None:
        if self._model is not None or settings.FORCE_FALLBACK:
            return
        with self._lock:
            if self._model is not None:
                return
            try:
                import torch
                import timesfm

                torch.set_float32_matmul_precision("high")
                model = timesfm.TimesFM_2p5_200M_torch.from_pretrained(settings.MODEL_ID)
                model.compile(
                    timesfm.ForecastConfig(
                        max_context=settings.MODEL_MAX_CONTEXT,
                        max_horizon=settings.MAX_HORIZON,
                        normalize_inputs=True,
                        use_continuous_quantile_head=True,
                        force_flip_invariance=True,
                        infer_is_positive=False,  # clamp in post-processing instead
                        fix_quantile_crossing=True,
                    )
                )
                self._model = model
                self._engine = ENGINE_PRIMARY
                self._load_error = None
            except Exception as exc:  # pragma: no cover - depends on environment
                self._load_error = f"{type(exc).__name__}: {exc}"
                # Server-side only — never returned over HTTP.
                print(
                    f"[engine] primary backend unavailable, serving baseline: "
                    f"{self._load_error}",
                    file=sys.stderr,
                )
                if not settings.ALLOW_FALLBACK:
                    raise
                self._engine = ENGINE_BASELINE

    def status(self) -> dict:
        """Public-safe status.

        Deliberately omits the raw loader exception: its text names the upstream
        package and would leak the implementation. Operators can still see it in
        the server log via ``internal_error()``.
        """
        if settings.FORCE_FALLBACK:
            return {"engine": ENGINE_BASELINE, "degraded": True}
        if self._model is not None:
            return {"engine": ENGINE_PRIMARY, "degraded": False}
        if self._load_error is not None:
            return {"engine": ENGINE_BASELINE, "degraded": True}
        return {"engine": "standby", "degraded": False}

    def internal_error(self) -> str | None:
        """Raw loader error, for server-side logging only. Never serialised."""
        return self._load_error

    # --------------------------------------------------------------- forecast
    def forecast(self, values, horizon: int, force_nonneg: bool = True):
        """Return (point[H], quantiles[H,10], engine)."""
        arr = clean_series(values)
        self._ensure_model()
        if self._model is not None and not settings.FORCE_FALLBACK:
            point, quant = self._forecast_primary(arr, horizon)
            engine = ENGINE_PRIMARY
        else:
            point, quant = self._forecast_fallback(arr, horizon)
            engine = ENGINE_BASELINE
        if force_nonneg:
            point = np.clip(point, 0.0, None)
            quant = np.clip(quant, 0.0, None)
        return point, quant, engine

    def _forecast_primary(self, arr: np.ndarray, horizon: int):
        point, quant = self._model.forecast(
            horizon=horizon, inputs=[arr.astype(np.float32)]
        )
        return np.asarray(point[0], dtype=np.float64), np.asarray(quant[0], dtype=np.float64)

    # ---------------------------------------------------------------- fallback
    @staticmethod
    def _detect_period(series: np.ndarray) -> int:
        n = len(series)
        if n < 8:
            return 1
        s = series - series.mean()
        denom = float(np.sum(s * s))
        if denom == 0:
            return 1
        best_lag, best_ac = 1, 0.30  # require a minimum autocorrelation
        for lag in range(2, min(n // 2, 400)):
            ac = float(np.sum(s[:-lag] * s[lag:]) / denom)
            if ac > best_ac:
                best_ac, best_lag = ac, lag
        return best_lag

    def _forecast_fallback(self, arr: np.ndarray, horizon: int):
        n = len(arr)
        x = np.arange(n, dtype=np.float64)
        # Linear trend
        slope, intercept = np.polyfit(x, arr, 1) if n >= 2 else (0.0, float(arr[-1]))
        trend = slope * x + intercept
        detr = arr - trend

        period = self._detect_period(detr)
        if period > 1 and n >= 2 * period:
            phase_means = np.array([detr[ph::period].mean() for ph in range(period)])
            seasonal_full = phase_means[np.arange(n) % period]
            resid = detr - seasonal_full
        else:
            period = 1
            phase_means = np.array([0.0])
            resid = detr

        sigma = float(resid.std(ddof=1)) if n > 2 else float(arr.std() or 1.0)
        sigma = max(sigma, 1e-8)

        fx = np.arange(n, n + horizon, dtype=np.float64)
        ftrend = slope * fx + intercept
        fseason = phase_means[fx.astype(int) % period] if period > 1 else 0.0
        point = ftrend + fseason

        steps = np.arange(1, horizon + 1, dtype=np.float64)
        widen = np.sqrt(1.0 + steps / max(1, period))  # bands grow with horizon
        band_sigma = sigma * widen

        quant = np.zeros((horizon, 10), dtype=np.float64)
        quant[:, 0] = point  # mean
        for idx, q in enumerate(_QLEVELS, start=1):
            quant[:, idx] = point + _ZSCORES[q] * band_sigma
        return point, quant


def compute_metrics(actual: np.ndarray, point: np.ndarray, quant: np.ndarray) -> dict:
    actual = np.asarray(actual, dtype=np.float64)
    point = np.asarray(point, dtype=np.float64)
    err = actual - point
    mae = float(np.mean(np.abs(err)))
    rmse = float(np.sqrt(np.mean(err ** 2)))
    nonzero = np.abs(actual) > 1e-9
    mape = (
        float(np.mean(np.abs(err[nonzero] / actual[nonzero])) * 100)
        if nonzero.any() else None
    )
    denom = np.abs(point) + np.abs(actual)
    smape = float(np.mean(2 * np.abs(err) / np.where(denom == 0, 1, denom)) * 100)
    lower80, upper80 = quant[:, 1], quant[:, 9]
    coverage80 = float(np.mean((actual >= lower80) & (actual <= upper80)) * 100)
    return {
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "mape": round(mape, 2) if mape is not None else None,
        "smape": round(smape, 2),
        "coverage_80": round(coverage80, 1),
    }
