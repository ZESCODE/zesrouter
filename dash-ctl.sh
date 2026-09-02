#!/data/data/com.termux/files/usr/bin/bash
# dash-ctl.sh <service> <start|stop>
# Allow-listed per-service control for the ZESRouter dashboard.
# Called only by ~/zesrouter-dash-server.mjs. No arbitrary input.
set -u
SVC="${1:-}"; ACT="${2:-}"
ENV_FILE="$HOME/.secure-credentials/master.env"
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }

ZR="$HOME/zesrouter"
LOG="$HOME/logs"; mkdir -p "$LOG/bitrouter" "$LOG"
CONTAINER_CFG="/data/data/com.termux/files/usr/var/lib/proot-distro/containers/debian/rootfs/root/.bitrouter/bitrouter.yaml"

port_up() { curl -s --max-time 2 "http://127.0.0.1:$1/v1/models" >/dev/null 2>&1 || curl -s --max-time 2 "http://127.0.0.1:$1/" >/dev/null 2>&1; }

case "$SVC" in
  zesrouter)
    if [ "$ACT" = "start" ]; then
      port_up 5051 && { echo "already up"; exit 0; }
      cp -f "$ZR/configs/bitrouter.yaml" "$CONTAINER_CFG"
      proot-distro login debian -- rm -f /root/.bitrouter/bitrouter.sock /root/.bitrouter/bitrouter.pid 2>/dev/null
      setsid proot-distro login debian -- bash /root/start-bitrouter.sh \
        > "$LOG/bitrouter/bitrouter.log" 2>&1 < /dev/null &
    elif [ "$ACT" = "stop" ]; then
      pkill -f 'bitrouter[.]orig [s]erve' 2>/dev/null || true
    fi
    ;;
  nvidia-bridge)
    if [ "$ACT" = "start" ]; then
      port_up 9456 && { echo "already up"; exit 0; }
      [ -z "${NVIDIA_API_KEY:-}" ] && { echo "no NVIDIA_API_KEY"; exit 1; }
      setsid env NVIDIA_API_KEY="$NVIDIA_API_KEY" python3 "$ZR/relay/nvidia_bridge.py" </dev/null >"$LOG/bitrouter/nvidia-bridge.log" 2>&1 &
    elif [ "$ACT" = "stop" ]; then
      pkill -f 'nvidia_bridge[.]py' 2>/dev/null || true
    fi
    ;;
  zen-relay)
    if [ "$ACT" = "start" ]; then
      port_up 7077 && { echo "already up"; exit 0; }
      cd "$ZR/relay" && setsid python3 zen_relay.py </dev/null >"$LOG/zen-relay.log" 2>&1 &
    elif [ "$ACT" = "stop" ]; then
      pkill -f 'zen_relay[.]py' 2>/dev/null || true
    fi
    ;;
  9router)
    if [ "$ACT" = "start" ]; then
      port_up 20128 && { echo "already up"; exit 0; }
      setsid nohup bash -lc 'exec node /data/data/com.termux/files/usr/bin/9router' </dev/null > "$LOG/9router.log" 2>&1 &
    elif [ "$ACT" = "stop" ]; then
      pkill -f 'node .*[/]9router' 2>/dev/null || true
    fi
    ;;
  opencode-zen)
    if [ "$ACT" = "start" ]; then
      port_up 4050 && { echo "already up"; exit 0; }
      setsid nohup opencode serve --port 4050 </dev/null > "$LOG/opencode-zen.log" 2>&1 &
    elif [ "$ACT" = "stop" ]; then
      pkill -f '[o]pencode serve --port 4050' 2>/dev/null || true
    fi
    ;;
  *) echo "unknown service: $SVC"; exit 2 ;;
esac
sleep 1
exit 0
