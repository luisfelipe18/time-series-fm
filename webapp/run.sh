#!/usr/bin/env bash
#
# Meridian — start the forecasting demonstration.
#
# Uses the uv already installed on this machine, creates the project
# environment (.venv) if it is missing, installs dependencies, and serves the
# app on port 7070.
#
#   ./run.sh              full engine (installs the model backend on first run)
#   LITE=1 ./run.sh       baseline engine only — no torch, no model download
#   PORT=8080 ./run.sh    serve on a different port
#
set -euo pipefail
cd "$(dirname "$0")"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-7070}"

# ---- require an existing uv ------------------------------------------------
if ! command -v uv >/dev/null 2>&1; then
  echo "Error: 'uv' was not found on PATH."
  echo "Install it once with:  curl -LsSf https://astral.sh/uv/install.sh | sh"
  echo "then re-run this script."
  exit 1
fi
echo "--> Using $(uv --version) at $(command -v uv)"

# ---- create the environment ------------------------------------------------
if [ ! -d ".venv" ]; then
  echo "--> Creating the project environment (.venv)"
  uv venv
else
  echo "--> Reusing the existing environment (.venv)"
fi

# ---- install dependencies --------------------------------------------------
if [ "${LITE:-0}" = "1" ]; then
  echo "--> LITE mode: installing light dependencies only (baseline engine)"
  uv sync
  export DEMO_FORCE_FALLBACK=1
else
  echo "--> Installing dependencies, including the model backend"
  uv sync --extra full
  echo "--> Model weights are fetched on the first projection request"
fi

# ---- check the port is free ------------------------------------------------
if command -v lsof >/dev/null 2>&1 && lsof -i ":${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Error: port ${PORT} is already in use. Free it, or run: PORT=8080 ./run.sh"
  exit 1
fi

echo ""
echo "===================================================================="
echo "  Meridian is running at:  http://localhost:${PORT}"
echo "  Press Ctrl+C to stop."
echo "===================================================================="
echo ""

exec uv run uvicorn backend.main:app --host "$HOST" --port "$PORT"
