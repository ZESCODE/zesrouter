#!/data/data/com.termux/files/usr/bin/bash
# start.sh — ZES Stack: 9Router + ZESRouter + NVIDIA + UI
# Architecture: 9Router(:20128) → ZESRouter(:5050) → NVIDIA(:9456)
# Usage: ./start.sh [start|stop|status|restart]

set -e

ZESROUTER_DIR="$HOME/zesrouter"
LOG_DIR="$HOME/logs"
NINEROUTER_PORT=20128
ZESROUTER_PORT=5050
NVIDIA_PORT=9456
UI_PORT=8080
ZEN_RELAY_PORT=7077

mkdir -p "$LOG_DIR/bitrouter"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

check_port() {
    curl -s --max-time 2 "http://127.0.0.1:$1/v1/models" >/dev/null 2>&1 || \
    curl -s --max-time 2 "http://127.0.0.1:$1/" >/dev/null 2>&1
}

start_ninerouter() {
    if check_port $NINEROUTER_PORT; then
        echo -e "${GREEN}[OK]${NC} 9Router already running on :$NINEROUTER_PORT"
        return 0
    fi
    echo -e "${YELLOW}[...]${NC} Starting 9Router (main gateway)..."
    setsid -f node /data/data/com.termux/files/usr/bin/9router \
        > "$LOG_DIR/9router.log" 2>&1
    sleep 3
    if check_port $NINEROUTER_PORT; then
        echo -e "${GREEN}[OK]${NC} 9Router running on :$NINEROUTER_PORT (main)"
    else
        echo -e "${RED}[FAIL]${NC} 9Router failed — check $LOG_DIR/9router.log"
        return 1
    fi
}

start_zesrouter() {
    if check_port $ZESROUTER_PORT; then
        echo -e "${GREEN}[OK]${NC} ZESRouter already running on :$ZESROUTER_PORT"
        return 0
    fi
    echo -e "${YELLOW}[...]${NC} Starting ZESRouter (fallback)..."
    cd "$ZESROUTER_DIR" && bash bin/zesrouter-start
    sleep 5
    if check_port $ZESROUTER_PORT; then
        echo -e "${GREEN}[OK]${NC} ZESRouter running on :$ZESROUTER_PORT (fallback)"
    else
        echo -e "${RED}[FAIL]${NC} ZESRouter failed — check $LOG_DIR/bitrouter/bitrouter.log"
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
    echo -e "${YELLOW}[...]${NC} Starting NVIDIA bridge (3rd fallback)..."
    setsid -f env NVIDIA_API_KEY="$NVIDIA_API_KEY" python3 "$ZESROUTER_DIR/relay/nvidia_bridge.py" \
        </dev/null >"$LOG_DIR/bitrouter/nvidia-bridge.log" 2>&1
    sleep 2
    if check_port $NVIDIA_PORT; then
        echo -e "${GREEN}[OK]${NC} NVIDIA bridge running on :$NVIDIA_PORT (3rd fallback)"
    else
        echo -e "${RED}[FAIL]${NC} NVIDIA bridge failed — check $LOG_DIR/bitrouter/nvidia-bridge.log"
    fi
}

start_zen_relay() {
    if check_port $ZEN_RELAY_PORT; then
        echo -e "${GREEN}[OK]${NC} Zen relay already running on :$ZEN_RELAY_PORT"
        return 0
    fi
    echo -e "${YELLOW}[...]${NC} Starting Zen relay..."
    cd "$ZESROUTER_DIR/relay" && setsid python3 zen_relay.py </dev/null >"$LOG_DIR/zen-relay.log" 2>&1 &
    disown
    sleep 2
    if check_port $ZEN_RELAY_PORT; then
        echo -e "${GREEN}[OK]${NC} Zen relay running on :$ZEN_RELAY_PORT"
    else
        echo -e "${RED}[FAIL]${NC} Zen relay failed — check $LOG_DIR/zen-relay.log"
    fi
}

start_ui() {
    if check_port $UI_PORT; then
        echo -e "${GREEN}[OK]${NC} Dashboard already running on :$UI_PORT"
        return 0
    fi
    echo -e "${YELLOW}[...]${NC} Starting dashboard..."
    cd "$ZESROUTER_DIR/ui" && nohup python3 server.py > "$LOG_DIR/zesrouter-ui.log" 2>&1 &
    sleep 2
    if check_port $UI_PORT; then
        echo -e "${GREEN}[OK]${NC} Dashboard running on :$UI_PORT"
    else
        echo -e "${RED}[FAIL]${NC} Dashboard failed — check $LOG_DIR/zesrouter-ui.log"
        return 1
    fi
}

stop_all() {
    echo "Stopping all services..."
    pkill -f "node.*9router" 2>/dev/null && echo "  Stopped 9Router" || true
    pkill -f "bitrouter.orig serve" 2>/dev/null && echo "  Stopped ZESRouter" || true
    pkill -f "nvidia_bridge.py" 2>/dev/null && echo "  Stopped NVIDIA bridge" || true
    pkill -f "zen_relay.py" 2>/dev/null && echo "  Stopped Zen relay" || true
    pkill -f "server.py" 2>/dev/null && echo "  Stopped Dashboard" || true
    sleep 2
    echo -e "${GREEN}[OK]${NC} All services stopped"
}

status() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║            ZES Stack Status                     ║${NC}"
    echo -e "${CYAN}╠══════════════════════════════════════════════════╣${NC}"

    # 9Router (Main)
    if check_port $NINEROUTER_PORT; then
        MODELS=$(curl -s --max-time 3 "http://127.0.0.1:$NINEROUTER_PORT/v1/models" 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('data',[])))" 2>/dev/null || echo "?")
        echo -e "║  ${GREEN}●${NC} 9Router   :$NINEROUTER_PORT  ${GREEN}RUNNING${NC}  ($MODELS models)  ║"
    else
        echo -e "║  ${RED}●${NC} 9Router   :$NINEROUTER_PORT  ${RED}STOPPED${NC}               ║"
    fi

    # ZESRouter (Fallback)
    if check_port $ZESROUTER_PORT; then
        MODELS=$(curl -s --max-time 3 "http://127.0.0.1:$ZESROUTER_PORT/v1/models" 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('data',[])))" 2>/dev/null || echo "?")
        echo -e "║  ${GREEN}●${NC} ZESRouter :$ZESROUTER_PORT  ${GREEN}RUNNING${NC}  ($MODELS models)  ║"
    else
        echo -e "║  ${RED}●${NC} ZESRouter :$ZESROUTER_PORT  ${RED}STOPPED${NC}               ║"
    fi

    # NVIDIA (3rd fallback)
    if check_port $NVIDIA_PORT; then
        echo -e "║  ${GREEN}●${NC} NVIDIA    :$NVIDIA_PORT     ${GREEN}RUNNING${NC}  (3rd fallback)   ║"
    else
        echo -e "║  ${RED}●${NC} NVIDIA    :$NVIDIA_PORT     ${RED}STOPPED${NC}               ║"
    fi

    # Zen Relay
    if check_port $ZEN_RELAY_PORT; then
        echo -e "║  ${GREEN}●${NC} Zen Relay :$ZEN_RELAY_PORT   ${GREEN}RUNNING${NC}  (free models)   ║"
    else
        echo -e "║  ${RED}●${NC} Zen Relay :$ZEN_RELAY_PORT   ${RED}STOPPED${NC}               ║"
    fi

    # Dashboard
    if check_port $UI_PORT; then
        echo -e "║  ${GREEN}●${NC} Dashboard :$UI_PORT       ${GREEN}RUNNING${NC}                   ║"
    else
        echo -e "║  ${RED}●${NC} Dashboard :$UI_PORT       ${RED}STOPPED${NC}                   ║"
    fi

    echo -e "${CYAN}╠══════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║  Routing: 9Router → ZESRouter → NVIDIA          ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
    echo ""
}

case "${1:-start}" in
    start)
        start_ninerouter
        start_zesrouter
        start_nvidia
        start_zen_relay
        start_ui
        status
        ;;
    stop)
        stop_all
        ;;
    restart)
        stop_all
        sleep 2
        start_ninerouter
        start_zesrouter
        start_nvidia
        start_zen_relay
        start_ui
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
