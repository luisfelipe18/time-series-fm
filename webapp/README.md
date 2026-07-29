# ForecastLab — TimesFM public demo webapp

A self-contained web app that showcases **zero-shot time-series forecasting**
with Google's [TimesFM 2.5](https://github.com/google-research/timesfm) as a
lead magnet: visitors upload a CSV (or pick a sample), choose a target column
and horizon, and instantly get a forecast with calibrated confidence intervals
— or a **backtest** that proves accuracy on their own data.

- **Backend:** FastAPI (Python) — thin API around the TimesFM model.
- **Frontend:** vanilla HTML + CSS + JS. **No build step, no npm, no bundler.**
- **Env:** managed by [`uv`](https://docs.astral.sh/uv/).
- **Chart:** drawn on a raw `<canvas>` — zero JS dependencies.

## Quick start

```bash
cd webapp
./run.sh                 # full model — installs TimesFM + torch, downloads ~800 MB on first forecast
# or, for a fast no-GPU trial with the built-in statistical fallback engine:
LITE=1 ./run.sh
```

Then open <http://localhost:8000>.

`run.sh` uses `uv sync` to create an isolated `.venv` and launches uvicorn.
Override the port with `PORT=9000 ./run.sh`.

## Why it converts (the sales hook)

- **Instant "wow":** samples forecast in one click — no signup, no setup.
- **Backtest mode** shows MAPE / MAE / RMSE / interval coverage on the
  visitor's *own* data — the honest, credible proof of accuracy.
- A clear upgrade **CTA** lists what the paid product adds (batch, covariates,
  anomaly alerts, REST API, fine-tuning).

## Demo throttle (abuse protection)

All limits live in `backend/config.py` and are overridable via env vars.

| Limit | Default | Env var |
| ----- | ------- | ------- |
| Max file size | 2 MB | `DEMO_MAX_FILE_BYTES` |
| Max rows kept (most recent) | 2000 | `DEMO_MAX_ROWS` |
| Max columns kept | 20 | `DEMO_MAX_COLUMNS` |
| Min points to forecast | 32 | `DEMO_MIN_POINTS` |
| Max horizon | 128 | `DEMO_MAX_HORIZON` |
| Forecasts per IP / window | 40 / 60 min | `DEMO_RATE_FORECASTS`, `DEMO_RATE_WINDOW` |
| Contact email (CTA) | — | `DEMO_CONTACT_EMAIL` |
| Brand name | ForecastLab | `DEMO_BRAND` |

Over-limit files are **trimmed** (keeping the most recent rows / first columns),
and the UI tells the visitor. Bad requests return `400`, oversized uploads
`413`, and rate-limited clients `429` with a `Retry-After` header.

## API

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET`  | `/api/health` | liveness + which engine is active |
| `GET`  | `/api/config` | demo limits (the frontend reads these) |
| `GET`  | `/api/samples` | bundled sample datasets |
| `POST` | `/api/inspect` | validate + parse an uploaded CSV (multipart) |
| `POST` | `/api/forecast` | run a forecast or backtest (rate limited) |

`GET /` serves the frontend; `/samples/*` serves the sample CSVs.

### `POST /api/forecast` body

```json
{
  "values": [/* target series, numbers (nulls allowed) */],
  "dates": ["2024-01-01", "..."],
  "horizon": 24,
  "mode": "future",          // or "backtest"
  "force_nonneg": true,
  "target_name": "sales"
}
```

## Engines

1. **`timesfm-2.5-200m`** — the real foundation model (primary path). Loads
   lazily on the first forecast and is cached for the process lifetime.
2. **`statistical-fallback`** — a transparent trend + seasonal + residual-band
   forecaster used **only** if torch/TimesFM can't be loaded, so the public demo
   never shows a blank screen. The engine actually used is always reported in
   the API response and shown in the UI, so nothing is misrepresented.

Force the fallback (e.g. for CPU-only hosting) with `DEMO_FORCE_FALLBACK=1`.

## Layout

```
webapp/
├── backend/
│   ├── main.py         # FastAPI app + routes + static mount
│   ├── config.py       # all demo limits / branding
│   ├── forecaster.py   # TimesFM wrapper + statistical fallback + metrics
│   └── limiter.py      # in-memory sliding-window rate limiter
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── app.js          # CSV parsing, API calls, canvas chart
│   └── samples/        # bundled demo CSVs + manifest.json
├── pyproject.toml      # uv project (torch is the optional `full` extra)
└── run.sh              # uv sync + uvicorn
```

## Production notes

- Swap the in-memory rate limiter for Redis behind multiple workers.
- Put it behind a reverse proxy (the app honours `X-Forwarded-For`).
- Pre-warm the model at startup if you want the first request to be fast.
- Not affiliated with or endorsed by Google. TimesFM is Apache-2.0; review the
  model-weight license on Hugging Face before commercial use.
```
