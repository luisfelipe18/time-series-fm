"""FastAPI backend for the Meridian forecasting demo.

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
import sys
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

# Files the page cannot work without. Checked at startup because a missing one
# only shows up as a silently broken page otherwise — and the usual cause is a
# working copy that never received them (a downloaded ZIP rather than a clone,
# or a pull that did not complete).
REQUIRED_ASSETS = [
    FRONTEND_DIR / "index.html",
    FRONTEND_DIR / "app.js",
    FRONTEND_DIR / "i18n.js",
    FRONTEND_DIR / "style.css",
    FRONTEND_DIR / "vendor" / "echarts.min.js",
]


def check_assets() -> list[Path]:
    """Report missing front-end files on the console at startup."""
    missing = [p for p in REQUIRED_ASSETS if not p.is_file()]
    if missing:
        print("\n" + "=" * 68, file=sys.stderr)
        print("  MISSING FRONT-END FILES — the page will not work correctly:", file=sys.stderr)
        for p in missing:
            print(f"    - {p}", file=sys.stderr)
        print("\n  Your working copy is incomplete. Fetch the files with:", file=sys.stderr)
        print("    git pull", file=sys.stderr)
        print("  If this folder is an extracted ZIP rather than a clone, git", file=sys.stderr)
        print("  cannot update it — clone the repository instead.", file=sys.stderr)
        print("=" * 68 + "\n", file=sys.stderr)
    else:
        print(f"--> Front-end assets present ({len(REQUIRED_ASSETS)} files)", file=sys.stderr)
    return missing

app = FastAPI(title="Meridian Forecasting API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

check_assets()

forecaster = Forecaster()
limiter = RateLimiter(settings.RATE_LIMIT_FORECASTS, settings.RATE_LIMIT_WINDOW_SEC)


def client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def api_error(status: int, code: str, message: str, headers=None, **params):
    """Raise a machine-readable error.

    ``code`` and ``params`` let the client render the message in the user's
    language; ``message`` is the English fallback for direct API consumers.
    """
    return HTTPException(
        status_code=status,
        detail={"code": code, "message": message, "params": params},
        headers=headers,
    )


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
            # encoding is explicit: read_text() would otherwise use the platform
            # default, which is cp1252 on Windows and mangles the accents.
            return json.loads(manifest_path.read_text(encoding="utf-8"))
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


def _decode_csv(raw: bytes) -> str:
    """Decode an uploaded CSV without assuming UTF-8.

    Excel on a Spanish-language Windows writes cp1252, so a column named
    "Año" would otherwise fail outright with a UnicodeDecodeError. utf-8-sig
    covers UTF-8 with a byte-order mark, which Excel also emits.
    """
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1")  # maps every byte; cannot raise


def _classify_column(col: pd.Series) -> tuple[str, pd.Series | None]:
    """Return ("numeric"|"date"|"text", parsed values or None)."""
    numeric = pd.to_numeric(col, errors="coerce")
    if int(numeric.notna().sum()) >= max(3, int(0.5 * len(col))):
        return "numeric", numeric
    if _is_date_like(col):
        return "date", pd.to_datetime(col, errors="coerce")
    return "text", None


def _sort_chronologically(df: pd.DataFrame) -> tuple[pd.DataFrame, bool]:
    """Put the rows in forward time order, keyed on the first date column.

    Financial exports (Investing.com, Yahoo Finance, most broker downloads)
    are newest-first. Fed in that order the engine reads the past as the
    future: it projects backwards, and the row cap below would keep the
    OLDEST rows instead of the most recent ones. Sorting here fixes both.

    Returns the dataframe and whether the original order had to be changed.
    """
    for name in df.columns:
        kind, parsed = _classify_column(df[name])
        if kind != "date" or parsed is None:
            continue
        if parsed.isna().all() or parsed.is_monotonic_increasing:
            return df, False
        order = parsed.sort_values(kind="stable").index
        return df.loc[order].reset_index(drop=True), True
    return df, False


@app.post("/api/inspect")
async def inspect(file: UploadFile = File(...)) -> dict:
    raw = await file.read(settings.MAX_FILE_SIZE_BYTES + 1)
    if len(raw) > settings.MAX_FILE_SIZE_BYTES:
        mb = settings.MAX_FILE_SIZE_BYTES // (1024 * 1024)
        raise api_error(413, "FILE_TOO_LARGE",
                        f"File too large. Demo limit is {mb} MB.", mb=mb)
    if not raw:
        raise api_error(400, "EMPTY_FILE", "Empty file.")

    try:
        df = pd.read_csv(io.StringIO(_decode_csv(raw)))
    except Exception as exc:
        raise api_error(400, "CSV_PARSE", f"Could not parse CSV: {exc}")

    if df.shape[1] == 0 or df.shape[0] == 0:
        raise api_error(400, "CSV_EMPTY", "CSV has no rows/columns.")

    col_truncated = df.shape[1] > settings.MAX_COLUMNS
    if col_truncated:
        df = df.iloc[:, : settings.MAX_COLUMNS]

    # Order first: the row cap below keeps the tail, which is only "the most
    # recent" once the rows actually run forwards in time.
    df, reordered = _sort_chronologically(df)

    total_rows = int(df.shape[0])
    row_truncated = total_rows > settings.MAX_ROWS
    if row_truncated:
        df = df.tail(settings.MAX_ROWS).reset_index(drop=True)  # keep most recent

    columns, numeric_columns, date_candidates = [], [], []
    numeric_data, date_data = {}, {}
    for name in df.columns:
        col = df[name]
        kind, parsed = _classify_column(col)
        is_numeric = kind == "numeric"
        is_date = kind == "date"
        numeric = parsed if is_numeric else pd.to_numeric(col, errors="coerce")
        n_numeric = int(numeric.notna().sum())
        columns.append(
            {
                "name": str(name),
                "kind": kind,
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
        raise api_error(400, "NO_NUMERIC", "No numeric columns found to forecast.")

    preview = json.loads(
        df.head(8).astype(object).where(pd.notna(df.head(8)), None).to_json(orient="records")
    )

    return {
        "n_rows": int(df.shape[0]),
        "n_cols": int(df.shape[1]),
        "original_rows": total_rows,
        "row_truncated": row_truncated,
        "col_truncated": col_truncated,
        "reordered": reordered,
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


def _is_reverse_chronological(dates: list[str] | None) -> bool:
    """True when the supplied dates run newest-first."""
    if not dates:
        return False
    try:
        idx = pd.to_datetime(pd.Series(dates), errors="coerce").dropna()
        if len(idx) < 3:
            return False
        return bool(idx.is_monotonic_decreasing and not idx.is_monotonic_increasing)
    except Exception:
        return False


def _infer_future_dates(dates: list[str] | None, n_context: int, horizon: int):
    if not dates:
        return None
    try:
        idx = pd.to_datetime(pd.Series(dates), errors="coerce").dropna()
        if len(idx) < 3:
            return None
        # Sort defensively: on a newest-first index infer_freq yields a negative
        # frequency ("-1D") and the projection would march into the past.
        idx = idx.sort_values().reset_index(drop=True)
        freq = pd.infer_freq(idx)
        if not freq:
            # fall back to the median spacing
            deltas = idx.diff().dropna()
            step = deltas.median()
            if pd.isna(step) or step <= pd.Timedelta(0):
                return None
            last = idx.iloc[-1]
            return [(last + step * (h + 1)).isoformat() for h in range(horizon)]
        future = pd.date_range(idx.iloc[-1], periods=horizon + 1, freq=freq)[1:]
        if len(future) and future[0] <= idx.iloc[-1]:
            return None  # never hand back dates that precede the series
        return [d.isoformat() for d in future]
    except Exception:
        return None


@app.post("/api/forecast")
def forecast(req: ForecastRequest, request: Request, response: Response) -> dict:
    # ---- rate limit -------------------------------------------------------
    allowed, retry_after, remaining = limiter.check(client_ip(request))
    if not allowed:
        minutes = settings.RATE_LIMIT_WINDOW_SEC // 60
        raise api_error(
            429, "RATE_LIMITED",
            f"Demo rate limit reached ({settings.RATE_LIMIT_FORECASTS} per "
            f"{minutes} min). Try again in {retry_after}s.",
            headers={"Retry-After": str(retry_after)},
            limit=settings.RATE_LIMIT_FORECASTS, minutes=minutes, retry=retry_after,
        )

    # ---- validate volume --------------------------------------------------
    if req.horizon > settings.MAX_HORIZON:
        raise api_error(400, "HORIZON_TOO_LARGE",
                        f"Horizon too large. Demo max is {settings.MAX_HORIZON}.",
                        max=settings.MAX_HORIZON)
    if len(req.values) > settings.MAX_ROWS:
        raise api_error(400, "TOO_MANY_POINTS",
                        f"Too many points. Demo max is {settings.MAX_ROWS} per series.",
                        max=settings.MAX_ROWS)

    # ---- orientation ------------------------------------------------------
    # A caller may post a newest-first series (financial exports are). Reading
    # it in that order makes the engine treat the past as the future, so put
    # it back in forward order before anything else touches it.
    values, dates = req.values, req.dates
    if _is_reverse_chronological(dates):
        values = list(reversed(values))
        dates = list(reversed(dates))

    series = clean_series(values)
    if len(series) < settings.MIN_POINTS:
        raise api_error(400, "TOO_FEW_POINTS",
                        f"Need at least {settings.MIN_POINTS} valid points "
                        f"(got {len(series)}).",
                        min=settings.MIN_POINTS, got=len(series))

    response.headers["X-RateLimit-Limit"] = str(settings.RATE_LIMIT_FORECASTS)
    response.headers["X-RateLimit-Remaining"] = str(remaining)

    # ---- run --------------------------------------------------------------
    if req.mode == "backtest":
        if len(series) < settings.MIN_POINTS + req.horizon:
            need = settings.MIN_POINTS + req.horizon
            raise api_error(400, "BACKTEST_TOO_SHORT",
                            f"Backtest needs at least {need} points for horizon "
                            f"{req.horizon}. Reduce the horizon or use a longer series.",
                            need=need, horizon=req.horizon)
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
        future_dates = _infer_future_dates(dates, len(series), req.horizon)

    # Trim history sent to the client for a readable chart / small payload.
    max_hist = min(len(history), max(4 * req.horizon, 200))
    hist_tail = history[-max_hist:]

    hist_dates = None
    if dates and req.mode == "future":
        clean_dates = [d for d in dates if d]
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
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail:
        content = {
            "error": detail.get("message", ""),
            "code": detail["code"],
            "params": detail.get("params", {}),
        }
    else:
        content = {"error": detail}
    return JSONResponse(
        status_code=exc.status_code, content=content, headers=exc.headers or {}
    )


# ----------------------------------------------------------- static frontend
class RevalidatingStatic(StaticFiles):
    """Serve the frontend with an explicit revalidation policy.

    With no Cache-Control header a browser falls back to heuristic caching and
    may keep serving a stale index.html after an update — which is how a page
    ends up running a new app.js against an old HTML that never requested the
    chart library, leaving the chart silently blank.

    "no-cache" does not disable caching; it requires the browser to revalidate.
    The ETag makes that cheap: an unchanged file comes back as a 304 with no
    body, so the 1 MB chart library is not re-sent on every visit.
    """

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers.setdefault("Cache-Control", "no-cache")
        return response


# Mounted AFTER the API routes so /api/* and /samples/* take precedence.
if SAMPLES_DIR.exists():
    app.mount("/samples", RevalidatingStatic(directory=str(SAMPLES_DIR)), name="samples")
if FRONTEND_DIR.exists():
    app.mount(
        "/", RevalidatingStatic(directory=str(FRONTEND_DIR), html=True), name="frontend"
    )
