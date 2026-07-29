#!/usr/bin/env bash
#
# Launch the Meridian forecasting demonstration (FastAPI + vanilla JS).
#
# Usage:
#   ./run.sh                 full engine (installs the model backend; ~800 MB on first use)
#   LITE=1 ./run.sh          baseline engine only — no torch, no model download
#   PORT=9000 ./run.sh       custom port
#
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v uv >/dev/null 2>&1; then
  echo "Error: 'uv' is not installed."
  echo "Install it with:  curl -LsSf https://astral.sh/uv/install.sh | sh"
  exit 1
fi

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"

if [[ "${LITE:-0}" == "1" ]]; then
  echo "--> LITE mode: light dependencies only (baseline engine, no torch)."
  uv sync
  export DEMO_FORCE_FALLBACK=1
else
  echo "--> Full mode: installing the model backend with uv (this can take a while)."
  uv sync --extra full
  echo "--> Model weights are fetched on the first forecast request."
fi

echo ""
echo "--> Meridian demonstration available at:  http://localhost:${PORT}"
echo "    Press Ctrl+C to stop."
echo ""
exec uv run uvicorn backend.main:app --host "$HOST" --port "$PORT"
