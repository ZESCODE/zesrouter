#!/data/data/com.termux/files/usr/bin/bash
# Start the ZESRouter reverse proxy on :5050
#   /v1/*  -> BitRouter API (now on :5051)
#   rest   -> Frost Control Panel (on :8090)
# BitRouter was moved from :5050 to :5051 (edit ~/zesrouter/configs/bitrouter.yaml
# then `bash ~/zesrouter/dash-ctl.sh zesrouter restart`).
set -u
ZR="/data/data/com.termux/files/home/zesrouter"
LOG="/data/data/com.termux/files/usr/tmp/opencode/rproxy-5050.log"
cd "$ZR"
LISTEN_PORT=5050 API_TARGET=127.0.0.1:5051 DASH_TARGET=127.0.0.1:8090 \
  setsid node "$ZR/rproxy-5050.mjs" > "$LOG" 2>&1 < /dev/null &
disown
sleep 1
echo "rproxy started (see $LOG)"
