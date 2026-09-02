#!/data/data/com.termux/files/usr/bin/bash
# start.sh — ZES Stack
# Architecture: BitRouter(:5050) + Relays(zen:7077, nvidia:9456)
# Usage: ./start.sh [start|stop|status|restart]

set -e

ZR="$HOME/zesrouter"
LOG="$HOME/logs"
CONTAINER_CFG="/data/data/com.termux/files/usr/var/lib/proot-distro/containers/debian/rootfs/root/.bitrouter/bitrouter.yaml"
BITROUTER_BIN="$HOME/.local/bin/bitrouter.orig"

BITROUTER_PORT=5051
NVIDIA_PORT=9456
ZEN_RELAY_PORT=7077
NINEROUTER_PORT=20128

mkdir -p "$LOG/bitrouter"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

check_port() {
    curl -s --max-time 2 "http://127.0.0.1:$1/v1/models" >/dev/null 2>&1 || \
    curl -s --max-time 2 "http://127.0.0.1:$1/" >/dev/null 2>&1
}

start_bitrouter() {
    if check_port $BITROUTER_PORT; then
        echo -e "${GREEN}[OK]${NC} BitRouter already running on :$BITROUTER_PORT"
        return 0
    fi
    echo -e "${YELLOW}[...]${NC} Starting BitRouter on :$BITROUTER_PORT..."
    cp -f "$ZR/configs/bitrouter.yaml" "$CONTAINER_CFG"
    proot-distro login debian -- rm -f /root/.bitrouter/bitrouter.sock /root/.bitrouter/bitrouter.pid 2>/dev/null
    ENV_FILE="$HOME/.secure-credentials/master.env"
    [ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }
    EV="export ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-} OPENAI_API_KEY=${OPENAI_API_KEY:-} OPENROUTER_API_KEY=${OPENROUTER_API_KEY:-} NVIDIA_API_KEY=${NVIDIA_API_KEY:-} POLLINATIONS_API_KEY=${POLLINATIONS_API_KEY:-}"
    setsid proot-distro login debian -- bash -c "POLLINATIONS_API_KEY='$POLLINATIONS_API_KEY' $EV && $BITROUTER_BIN serve --config /root/.bitrouter/bitrouter.yaml" \
        > "$LOG/bitrouter/bitrouter.log" 2>&1 < /dev/null &
    sleep 5
    if check_port $BITROUTER_PORT; then
        echo -e "${GREEN}[OK]${NC} BitRouter running on :$BITROUTER_PORT"
    else
        echo -e "${RED}[FAIL]${NC} BitRouter failed — check $LOG/bitrouter/bitrouter.log"
        return 1
    fi
}

start_nvidia() {
    if check_port $NVIDIA_PORT; then
        echo -e "${GREEN}[OK]${NC} NVIDIA bridge already running on :$NVIDIA_PORT"
        return 0
    fi
    ENV_FILE="$HOME/.secure-credentials/master.env"
    if [ -f "$ENV_FILE" ]; then
        NVIDIA_API_KEY=$(grep '^NVIDIA_API_KEY=' "$ENV_FILE" | cut -d= -f2)
    fi
    if [ -z "$NVIDIA_API_KEY" ]; then
        echo -e "${YELLOW}[SKIP]${NC} No NVIDIA_API_KEY — bridge not started"
        return 0
    fi
    echo -e "${YELLOW}[...]${NC} Starting NVIDIA bridge on :$NVIDIA_PORT..."
    setsid -f env NVIDIA_API_KEY="$NVIDIA_API_KEY" python3 "$ZR/relay/nvidia_bridge.py" \
        </dev/null >"$LOG/bitrouter/nvidia-bridge.log" 2>&1
    sleep 2
    if check_port $NVIDIA_PORT; then
        echo -e "${GREEN}[OK]${NC} NVIDIA bridge running on :$NVIDIA_PORT"
    else
        echo -e "${RED}[FAIL]${NC} NVIDIA bridge failed — check $LOG/bitrouter/nvidia-bridge.log"
    fi
}

start_zen_relay() {
    if check_port $ZEN_RELAY_PORT; then
        echo -e "${GREEN}[OK]${NC} Zen relay already running on :$ZEN_RELAY_PORT"
        return 0
    fi
    echo -e "${YELLOW}[...]${NC} Starting Zen relay on :$ZEN_RELAY_PORT..."
    cd "$ZR/relay" && setsid python3 zen_relay.py </dev/null >"$LOG/zen-relay.log" 2>&1 &
    disown
    sleep 2
    if check_port $ZEN_RELAY_PORT; then
        echo -e "${GREEN}[OK]${NC} Zen relay running on :$ZEN_RELAY_PORT"
    else
        echo -e "${RED}[FAIL]${NC} Zen relay failed — check $LOG/zen-relay.log"
    fi
}

start_pollinations_relay() {
    POLLINATIONS_PORT=7079
    if check_port $POLLINATIONS_PORT; then
        echo -e "${GREEN}[OK]${NC} Pollinations relay already running on :$POLLINATIONS_PORT"
        return 0
    fi
    echo -e "${YELLOW}[...]${NC} Starting Pollinations relay on :$POLLINATIONS_PORT..."
    cd "$ZR/relay" && nohup python3 pollinations_relay.py </dev/null >"$LOG/pollinations-relay.log" 2>&1 &
    sleep 2
    if check_port $POLLINATIONS_PORT; then
        echo -e "${GREEN}[OK]${NC} Pollinations relay running on :$POLLINATIONS_PORT"
    else
        echo -e "${RED}[FAIL]${NC} Pollinations relay failed — check $LOG/pollinations-relay.log"
    fi
}

start_ninerouter() {
    if check_port $NINEROUTER_PORT; then
        echo -e "${GREEN}[OK]${NC} 9Router already running on :$NINEROUTER_PORT"
        return 0
    fi
    echo -e "${YELLOW}[...]${NC} Starting 9Router on :$NINEROUTER_PORT..."
    setsid -f node /data/data/com.termux/files/usr/bin/9router \
        > "$LOG/9router.log" 2>&1
    sleep 3
    if check_port $NINEROUTER_PORT; then
        echo -e "${GREEN}[OK]${NC} 9Router running on :$NINEROUTER_PORT"
    else
        echo -e "${RED}[FAIL]${NC} 9Router failed — check $LOG/9router.log"
    fi
}

stop_all() {
    echo "Stopping all services..."
    pkill -f 'bitrouter[.]orig [s]erve' 2>/dev/null && echo "  Stopped BitRouter" || true
    pkill -f "nvidia_bridge.py" 2>/dev/null && echo "  Stopped NVIDIA bridge" || true
    pkill -f "zen_relay.py" 2>/dev/null && echo "  Stopped Zen relay" || true
    pkill -f "node.*9router" 2>/dev/null && echo "  Stopped 9Router" || true
    sleep 2
    echo -e "${GREEN}[OK]${NC} All services stopped"
}

status() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║              ZES Stack Status                       ║${NC}"
    echo -e "${CYAN}╠══════════════════════════════════════════════════════╣${NC}"

    if check_port $BITROUTER_PORT; then
        MODELS=$(curl -s --max-time 3 "http://127.0.0.1:$BITROUTER_PORT/v1/models" 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('data',[])))" 2>/dev/null || echo "?")
        echo -e "║  ${GREEN}●${NC} BitRouter :$BITROUTER_PORT  ${GREEN}RUNNING${NC}  ($MODELS models)    ║"
    else
        echo -e "║  ${RED}●${NC} BitRouter :$BITROUTER_PORT  ${RED}STOPPED${NC}                   ║"
    fi

    if check_port $NVIDIA_PORT; then
        echo -e "║  ${GREEN}●${NC} NVIDIA    :$NVIDIA_PORT      ${GREEN}RUNNING${NC}  (fallback)        ║"
    else
        echo -e "║  ${RED}●${NC} NVIDIA    :$NVIDIA_PORT      ${RED}STOPPED${NC}                   ║"
    fi

    if check_port $ZEN_RELAY_PORT; then
        echo -e "║  ${GREEN}●${NC} Zen Relay :$ZEN_RELAY_PORT    ${GREEN}RUNNING${NC}  (free models)     ║"
    else
        echo -e "║  ${RED}●${NC} Zen Relay :$ZEN_RELAY_PORT    ${RED}STOPPED${NC}                   ║"
    fi

    if check_port $NINEROUTER_PORT; then
        MODELS=$(curl -s --max-time 3 "http://127.0.0.1:$NINEROUTER_PORT/v1/models" 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('data',[])))" 2>/dev/null || echo "?")
        echo -e "║  ${GREEN}●${NC} 9Router   :$NINEROUTER_PORT  ${GREEN}RUNNING${NC}  ($MODELS models)    ║"
    else
        echo -e "║  ${RED}●${NC} 9Router   :$NINEROUTER_PORT  ${RED}STOPPED${NC}                   ║"
    fi

    echo -e "${CYAN}╠══════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║  :5050(bitrouter) → relays(7077,9456)              ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
    echo ""
}

case "${1:-start}" in
    start)
        start_bitrouter
        start_nvidia
        start_zen_relay
        start_pollinations_relay
        start_ninerouter
        status
        ;;
    stop)
        stop_all
        ;;
    restart)
        stop_all
        sleep 2
        start_bitrouter
        start_nvidia
        start_zen_relay
        start_pollinations_relay
        start_ninerouter
        status
        ;;
    status)
        status
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
