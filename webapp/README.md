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

Linux / macOS:

```bash
cd webapp
./run.sh                 # full engine
LITE=1 ./run.sh          # baseline engine only (no torch, no model download)
```

Windows:

```bat
cd webapp
run.bat
set LITE=1 && run.bat     :: baseline engine only
```

Both scripts use the `uv` already installed on the machine, create `.venv` if it
is missing, install dependencies, and serve on **port 7070**.
Open <http://localhost:7070>. Override with `PORT=8080 ./run.sh` (or
`set PORT=8080 && run.bat`).

> `run.bat` must keep CRLF line endings — `.gitattributes` enforces this, since
> `cmd.exe` mis-parses batch files saved with Unix endings.

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
for p in / /app.js /i18n.js /style.css /api/health /api/config /api/samples /openapi.json; do
  echo "$p -> $(curl -s "http://localhost:7070$p" | grep -ci 'timesfm\|google') hit(s)"
done
```

## Languages

The interface is bilingual, Spanish and English, switched by the ES/EN control in
the top bar. All copy lives in `frontend/i18n.js`; nothing is hard-coded in the
markup — every string carries a `data-i18n` key.

Server-side messages are localised too: the API returns a machine-readable
`code` plus `params` (e.g. `TOO_FEW_POINTS` with `{min, got}`) alongside an
English `message`, and the client renders it in the active language. Direct API
consumers can keep reading `error` as before.

Language is resolved in this order:

1. the visitor's own choice, remembered in `localStorage`;
2. `DEMO_DEFAULT_LANG` (default `es`);
3. the browser locale — **only** if `DEMO_RESPECT_BROWSER_LANG=1`, since an
   explicitly configured default should not be overridden by a visitor's locale.

Prepared datasets carry `title_es` / `description_es` in `samples/manifest.json`
next to the English fields; add both when you add a dataset.

## Commercial model

The service is sold **API-only** — the engine is never licensed or installed on
client infrastructure. Billing unit is the **projection** (one series returned).
Plans, unit economics and the rationale are in
[`BUSINESS_MODEL.md`](BUSINESS_MODEL.md).

Published rates live in `frontend/i18n.js` under the `pr.*` keys and render in
section IV of the page. **They must stay in step with `BUSINESS_MODEL.md`** —
changing one without the other puts a different number on the page than in the
commercial document.

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
| Brand / established | Meridian · MMXXVI | `DEMO_BRAND`, `DEMO_ESTABLISHED` |
| Wordmark suffix | follows the language | `DEMO_BRAND_SUFFIX` (set to pin one wording) |
| Contact address | sales@vilcongroup.com | `DEMO_CONTACT_EMAIL` |
| Default language | `es` | `DEMO_DEFAULT_LANG` |
| Follow browser locale | off | `DEMO_RESPECT_BROWSER_LANG` |
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
│   ├── i18n.js         Spanish/English copy and the t() helper
│   ├── app.js          CSV handling, API calls, canvas chart
│   └── samples/        prepared CSVs + manifest.json
├── pyproject.toml      uv project (model backend is the optional `full` extra)
├── run.sh              uv venv + uv sync + uvicorn on :7070 (Linux/macOS)
└── run.bat             the same, for Windows (CRLF endings)
```

## Production notes

- Replace the in-memory limiter with Redis behind multiple workers.
- Put it behind a reverse proxy; the app honours `X-Forwarded-For`.
- Pre-warm the engine at startup if the first request must be fast.
- Review the model-weight licence before commercial deployment; the code licence
  and the weight licence are separate instruments.
