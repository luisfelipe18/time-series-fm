"""FastAPI backend for the public TimesFM forecasting demo.

Endpoints
    GET  /api/health          liveness + which engine is active
    GET  /api/config          demo limits (frontend reads these)
    GET  /api/samples         list of bundled sample datasets
    POST /api/inspect         validate + parse an uploaded CSV (enforces limits)
    POST /api/forecast        run a forecast or a backtest (rate limited)

The frontend (vanilla HTML/CSS/JS) is served from ``/``.
"""

from __future__ import annotations

import io
import json
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .config import settings
from .forecaster import Forecaster, clean_series, compute_metrics
from .limiter import RateLimiter

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
SAMPLES_DIR = FRONTEND_DIR / "samples"

app = FastAPI(title="TimesFM Forecast Demo", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

forecaster = Forecaster()
limiter = RateLimiter(settings.RATE_LIMIT_FORECASTS, settings.RATE_LIMIT_WINDOW_SEC)


def client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# --------------------------------------------------------------------- health
@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", **forecaster.status()}


@app.get("/api/config")
def get_config() -> dict:
    return settings.public_dict()


# -------------------------------------------------------------------- samples
def _sample_manifest() -> list[dict]:
    manifest_path = SAMPLES_DIR / "manifest.json"
    if manifest_path.exists():
        try:
            return json.loads(manifest_path.read_text())
        except Exception:
            pass
    return []


@app.get("/api/samples")
def list_samples() -> list[dict]:
    items = []
    for entry in _sample_manifest():
        f = SAMPLES_DIR / entry["file"]
        if f.exists():
            entry = {**entry, "url": f"/samples/{entry['file']}"}
            items.append(entry)
    return items


# -------------------------------------------------------------------- inspect
def _is_date_like(series: pd.Series) -> bool:
    non_null = series.dropna()
    if non_null.empty:
        return False
    sample = non_null.head(50)
    parsed = pd.to_datetime(sample, errors="coerce")
    return parsed.notna().mean() >= 0.8


def _column_data(series: pd.Series) -> list:
    return [None if pd.isna(v) else float(v) for v in series]


@app.post("/api/inspect")
async def inspect(file: UploadFile = File(...)) -> dict:
    raw = await file.read(settings.MAX_FILE_SIZE_BYTES + 1)
    if len(raw) > settings.MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Demo limit is "
            f"{settings.MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB.",
        )
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file.")

    try:
        df = pd.read_csv(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {exc}")

    if df.shape[1] == 0 or df.shape[0] == 0:
        raise HTTPException(status_code=400, detail="CSV has no rows/columns.")

    col_truncated = df.shape[1] > settings.MAX_COLUMNS
    if col_truncated:
        df = df.iloc[:, : settings.MAX_COLUMNS]

    total_rows = int(df.shape[0])
    row_truncated = total_rows > settings.MAX_ROWS
    if row_truncated:
        df = df.tail(settings.MAX_ROWS).reset_index(drop=True)  # keep most recent

    columns, numeric_columns, date_candidates = [], [], []
    numeric_data, date_data = {}, {}
    for name in df.columns:
        col = df[name]
        numeric = pd.to_numeric(col, errors="coerce")
        n_numeric = int(numeric.notna().sum())
        is_numeric = n_numeric >= max(3, int(0.5 * len(col)))
        is_date = (not is_numeric) and _is_date_like(col)
        columns.append(
            {
                "name": str(name),
                "kind": "numeric" if is_numeric else ("date" if is_date else "text"),
                "n_valid": n_numeric if is_numeric else int(col.notna().sum()),
            }
        )
        if is_numeric:
            numeric_columns.append(str(name))
            numeric_data[str(name)] = _column_data(numeric)
        if is_date:
            date_candidates.append(str(name))
            parsed = pd.to_datetime(col, errors="coerce")
            date_data[str(name)] = [
                None if pd.isna(v) else v.isoformat() for v in parsed
            ]

    if not numeric_columns:
        raise HTTPException(
            status_code=400,
            detail="No numeric columns found to forecast.",
        )

    preview = json.loads(
        df.head(8).astype(object).where(pd.notna(df.head(8)), None).to_json(orient="records")
    )

    return {
        "n_rows": int(df.shape[0]),
        "n_cols": int(df.shape[1]),
        "original_rows": total_rows,
        "row_truncated": row_truncated,
        "col_truncated": col_truncated,
        "columns": columns,
        "numeric_columns": numeric_columns,
        "date_candidates": date_candidates,
        "preview": preview,
        "data": numeric_data,
        "dates": date_data,
    }


# ------------------------------------------------------------------- forecast
class ForecastRequest(BaseModel):
    values: list[float | None] = Field(..., description="Target series values")
    dates: list[str] | None = Field(default=None, description="Optional ISO dates")
    horizon: int = Field(..., ge=1)
    mode: str = Field(default="future", pattern="^(future|backtest)$")
    force_nonneg: bool = True
    target_name: str | None = None


def _infer_future_dates(dates: list[str] | None, n_context: int, horizon: int):
    if not dates:
        return None
    try:
        idx = pd.to_datetime(pd.Series(dates), errors="coerce").dropna()
        if len(idx) < 3:
            return None
        freq = pd.infer_freq(idx)
        if not freq:
            # fall back to the median spacing
            deltas = idx.diff().dropna()
            step = deltas.median()
            last = idx.iloc[-1]
            return [(last + step * (h + 1)).isoformat() for h in range(horizon)]
        future = pd.date_range(idx.iloc[-1], periods=horizon + 1, freq=freq)[1:]
        return [d.isoformat() for d in future]
    except Exception:
        return None


@app.post("/api/forecast")
def forecast(req: ForecastRequest, request: Request, response: Response) -> dict:
    # ---- rate limit -------------------------------------------------------
    allowed, retry_after, remaining = limiter.check(client_ip(request))
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Demo rate limit reached "
            f"({settings.RATE_LIMIT_FORECASTS} forecasts per "
            f"{settings.RATE_LIMIT_WINDOW_SEC // 60} min). Try again in "
            f"{retry_after}s or contact us for an API key.",
            headers={"Retry-After": str(retry_after)},
        )

    # ---- validate volume --------------------------------------------------
    if req.horizon > settings.MAX_HORIZON:
        raise HTTPException(
            status_code=400,
            detail=f"Horizon too large. Demo max is {settings.MAX_HORIZON}.",
        )
    if len(req.values) > settings.MAX_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many points. Demo max is {settings.MAX_ROWS} per series.",
        )

    series = clean_series(req.values)
    if len(series) < settings.MIN_POINTS:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least {settings.MIN_POINTS} valid points "
            f"(got {len(series)}).",
        )

    response.headers["X-RateLimit-Limit"] = str(settings.RATE_LIMIT_FORECASTS)
    response.headers["X-RateLimit-Remaining"] = str(remaining)

    # ---- run --------------------------------------------------------------
    if req.mode == "backtest":
        if len(series) < settings.MIN_POINTS + req.horizon:
            raise HTTPException(
                status_code=400,
                detail=f"Backtest needs at least "
                f"{settings.MIN_POINTS + req.horizon} points for horizon "
                f"{req.horizon}. Reduce the horizon or use a longer series.",
            )
        train, actual = series[: -req.horizon], series[-req.horizon:]
        point, quant, engine = forecaster.forecast(train, req.horizon, req.force_nonneg)
        metrics = compute_metrics(actual, point, quant)
        history = train
        actual_out = actual.tolist()
        future_dates = None  # backtest overlays known dates client-side
    else:
        point, quant, engine = forecaster.forecast(series, req.horizon, req.force_nonneg)
        metrics = None
        history = series
        actual_out = None
        future_dates = _infer_future_dates(req.dates, len(series), req.horizon)

    # Trim history sent to the client for a readable chart / small payload.
    max_hist = min(len(history), max(4 * req.horizon, 200))
    hist_tail = history[-max_hist:]

    hist_dates = None
    if req.dates and req.mode == "future":
        clean_dates = [d for d in req.dates if d]
        if len(clean_dates) >= len(history):
            hist_dates = clean_dates[len(history) - max_hist: len(history)]

    return {
        "engine": engine,
        "mode": req.mode,
        "horizon": req.horizon,
        "target_name": req.target_name,
        "history": [round(float(v), 6) for v in hist_tail],
        "history_dates": hist_dates,
        "point": [round(float(v), 6) for v in point],
        "median": [round(float(v), 6) for v in quant[:, 5]],
        "lower_80": [round(float(v), 6) for v in quant[:, 1]],
        "upper_80": [round(float(v), 6) for v in quant[:, 9]],
        "lower_60": [round(float(v), 6) for v in quant[:, 2]],
        "upper_60": [round(float(v), 6) for v in quant[:, 8]],
        "actual": actual_out,
        "future_dates": future_dates,
        "metrics": metrics,
        "rate": {"limit": settings.RATE_LIMIT_FORECASTS, "remaining": remaining},
    }


@app.exception_handler(HTTPException)
async def http_exc_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail},
        headers=exc.headers or {},
    )


# ----------------------------------------------------------- static frontend
# Mounted AFTER the API routes so /api/* and /samples/* take precedence.
if SAMPLES_DIR.exists():
    app.mount("/samples", StaticFiles(directory=str(SAMPLES_DIR)), name="samples")
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
