#!/usr/bin/env bash
#
# Launch the TimesFM forecasting demo (FastAPI backend + vanilla JS frontend).
#
# Usage:
#   ./run.sh                 # full model (downloads ~800 MB TimesFM weights once)
#   LITE=1 ./run.sh          # fallback engine only — no torch, no model download
#   PORT=9000 ./run.sh       # custom port
#
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v uv >/dev/null 2>&1; then
  echo "❌ 'uv' is not installed."
  echo "   Install it with:  curl -LsSf https://astral.sh/uv/install.sh | sh"
  exit 1
fi

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"

if [[ "${LITE:-0}" == "1" ]]; then
  echo "==> LITE mode: light deps only (statistical fallback engine, no torch)."
  uv sync
  export DEMO_FORCE_FALLBACK=1
else
  echo "==> Full mode: installing TimesFM + torch with uv (this can take a while)…"
  uv sync --extra full
  echo "==> The TimesFM 2.5 weights (~800 MB) download on the first forecast request."
fi

echo ""
echo "==> ForecastLab demo running at:  http://localhost:${PORT}"
echo "    Press Ctrl+C to stop."
echo ""
exec uv run uvicorn backend.main:app --host "$HOST" --port "$PORT"
