# Meridian — forecasting demonstration webapp

A self-contained web app that demonstrates zero-shot time-series forecasting as a
lead magnet: a visitor submits a CSV (or picks a prepared dataset), chooses a
target series and horizon, and receives a projection with calibrated intervals —
or a **validation** run that scores the engine against withheld history.

- **Backend:** FastAPI (Python).
- **Frontend:** vanilla HTML + CSS + JS. **No build step, no npm, no bundler.**
- **Environment:** managed by [`uv`](https://docs.astral.sh/uv/).
- **Chart:** drawn directly on `<canvas>` — zero JS dependencies.

## Quick start

```bash
cd webapp
./run.sh                 # full engine
LITE=1 ./run.sh          # baseline engine only (no torch, no model download)
```

Then open <http://localhost:8000>. Override the port with `PORT=9000 ./run.sh`.

## White-labelling (important)

The public surface is deliberately **unbranded with respect to the upstream
model**. The product is presented as a proprietary in-house engine, so:

- No page copy, asset, API response, or OpenAPI schema names the upstream project.
- Public engine identifiers are `meridian-core` (primary) and `meridian-baseline`
  (statistical fallback).
- `/api/health` reports `{engine, degraded}` only. The loader exception is
  **never** serialised — it names the upstream package. Operators see it in the
  server log instead.

Upstream attribution is retained where the licence actually requires it: the
repository `LICENSE` and the source headers. Apache-2.0 obliges you to preserve
notices in distributed **source**, not in the UI of a hosted service. If you ever
redistribute the code itself, keep those notices intact.

Verify the public surface stays clean after any change:

```bash
for p in / /app.js /style.css /api/health /api/config /api/samples /openapi.json; do
  echo "$p -> $(curl -s "http://localhost:8000$p" | grep -ci 'timesfm\|google') hit(s)"
done
```

## House style

Warm ivory ground, ink text, English racing green, claret and aged brass.
Serif setting (system stack — no external font requests), hairline rules, square
corners, no gradients or glows. Charts follow print convention: observed history
solid, **projections dashed**, intervals as a light claret wash, axes snapped to
round figures.

## Demo throttle (abuse protection)

All limits live in `backend/config.py`, each overridable by environment variable.

| Limit | Default | Env var |
| ----- | ------- | ------- |
| Max file size | 2 MB | `DEMO_MAX_FILE_BYTES` |
| Max rows kept (most recent) | 2000 | `DEMO_MAX_ROWS` |
| Max columns kept | 20 | `DEMO_MAX_COLUMNS` |
| Min points to forecast | 32 | `DEMO_MIN_POINTS` |
| Max horizon | 128 | `DEMO_MAX_HORIZON` |
| Computations per IP / window | 40 / 60 min | `DEMO_RATE_FORECASTS`, `DEMO_RATE_WINDOW` |
| Brand / suffix / established | Meridian · Forecasting · MMXXVI | `DEMO_BRAND`, `DEMO_BRAND_SUFFIX`, `DEMO_ESTABLISHED` |
| Contact address | — | `DEMO_CONTACT_EMAIL` |
| Force baseline engine | off | `DEMO_FORCE_FALLBACK` |

Over-limit files are **trimmed** (most recent rows, first columns) and the UI
says so. Bad requests return `400`, oversized uploads `413`, throttled clients
`429` with `Retry-After`.

## API

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET`  | `/api/health` | liveness + active engine |
| `GET`  | `/api/config` | demo limits and branding (the frontend reads these) |
| `GET`  | `/api/samples` | prepared datasets |
| `POST` | `/api/inspect` | validate + parse an uploaded CSV (multipart) |
| `POST` | `/api/forecast` | projection or validation run (rate limited) |

`GET /` serves the frontend; `/samples/*` serves the prepared CSVs.

### `POST /api/forecast`

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

1. **`meridian-core`** — the foundation-model backend (primary). Loads lazily on
   the first request and is held for the process lifetime.
2. **`meridian-baseline`** — a trend + seasonal + residual-band forecaster used
   **only** if the primary backend cannot load, so the demonstration never shows
   a blank screen. Which engine produced a result is always reported in the API
   response and surfaced in the UI, so figures are never misattributed.

Force the baseline (e.g. CPU-only hosting) with `DEMO_FORCE_FALLBACK=1`.

## Layout

```
webapp/
├── backend/
│   ├── main.py         FastAPI app, routes, static mount
│   ├── config.py       demo limits and branding
│   ├── forecaster.py   model wrapper, baseline engine, metrics
│   └── limiter.py      in-memory sliding-window rate limiter
├── frontend/
│   ├── index.html
│   ├── style.css       house style
│   ├── app.js          CSV handling, API calls, canvas chart
│   └── samples/        prepared CSVs + manifest.json
├── pyproject.toml      uv project (model backend is the optional `full` extra)
└── run.sh              uv sync + uvicorn
```

## Production notes

- Replace the in-memory limiter with Redis behind multiple workers.
- Put it behind a reverse proxy; the app honours `X-Forwarded-For`.
- Pre-warm the engine at startup if the first request must be fast.
- Review the model-weight licence before commercial deployment; the code licence
  and the weight licence are separate instruments.
