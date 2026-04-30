#!/bin/bash
# Start both the log server and Vite dev server for network access
# Usage: ./start-dev.sh [--no-log]

ENABLE_LOG_SERVER=true

for arg in "$@"; do
  case $arg in
    --no-log)
      ENABLE_LOG_SERVER=false
      shift
      ;;
  esac
done

cleanup() {
  echo "Stopping servers..."
  kill $LOG_PID $VITE_PID 2>/dev/null
  exit 0
}

trap cleanup SIGINT SIGTERM

cd "$(dirname "$0")"

if [ "$ENABLE_LOG_SERVER" = true ]; then
  echo "Starting log server on port 3001..."
  node log-server.mjs &
  LOG_PID=$!
else
  echo "Log server disabled (--no-log)"
  LOG_PID=""
fi

echo "Starting Vite dev server with HTTPS..."
pnpm dev --host &
VITE_PID=$!

echo ""
echo "Servers started!"
if [ "$ENABLE_LOG_SERVER" = true ]; then
  echo "Log server PID: $LOG_PID"
fi
echo "Vite server PID: $VITE_PID"
echo ""
echo "Press Ctrl+C to stop servers"

wait
