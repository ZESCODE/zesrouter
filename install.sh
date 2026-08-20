#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# ZESRouter — complete installer for Termux/Android
#   - clones/updates repo to ~/zesrouter
#   - installs python3 + pyyaml + proot-distro debian
#   - fetches BitRouter binary (byte-verified) + config
#   - starts daemon :4356, starts UI :8080
# Idempotent: safe to re-run; skips what already works.
# Usage: curl -fsSL https://raw.githubusercontent.com/zesxdev/zesrouter/main/install.sh | bash
# ============================================================
set -euo pipefail

REPO_URL="https://github.com/zesxdev/zesrouter.git"
APP_DIR="$HOME/zesrouter"
UI_DIR="$APP_DIR/ui"
UI_LOG="$HOME/logs/zesrouter-ui.log"
DAEMON_URL="http://localhost:4356"

C() { printf "\033[1;%sm%s\033[0m\n" "$1" "$2"; }
ok()   { C 32 "  [OK] $1"; }
info() { C 36 "  ..  $1"; }
warn() { C 33 "  [!] $1"; }
die()  { C 31 "  [X] $1"; exit 1; }

echo
C 36 "============================================="
C 36 " ZESRouter installer — Termux/Android"
C 36 "============================================="

# 1. repo ---------------------------------------------------------------
info "repo: $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --depth 1 "$REPO_URL" "$APP_DIR" || die "clone failed"
  ok "cloned $REPO_URL"
else
  (cd "$APP_DIR" && git pull --ff-only -q) || warn "pull failed — continuing with local copy"
  ok "repo up to date"
fi

# 2. termux deps --------------------------------------------------------
info "deps: python3, pyyaml"
command -v python3 >/dev/null 2>&1 || pkg install -y python || die "pkg install python failed"
python3 -c "import yaml" 2>/dev/null || pip install pyyaml || die "pyyaml install failed"
ok "python3 + pyyaml"

# 3. proot-distro debian ------------------------------------------------
info "proot-distro debian"
command -v proot-distro >/dev/null 2>&1 || die "proot-distro missing — run: pkg install proot-distro"
if ! proot-distro list 2>&1 | grep -qi debian; then
  warn "installing debian rootfs (large download, ~150MB)..."
  proot-distro install debian || die "proot-distro install debian failed"
fi
ok "debian rootfs"

# 4. bitrouter binary (byte-verified) + config --------------------------
if [ ! -x "$HOME/.local/bin/bitrouter.orig" ]; then
  info "fetching bitrouter binary"
  bash "$APP_DIR/bin/fetch-binary.sh" || die "fetch-binary failed"
fi
ok "bitrouter binary"

PROOT_BR="/data/data/com.termux/files/usr/var/lib/proot-distro/containers/debian/rootfs/root/.bitrouter"
if [ ! -f "$PROOT_BR/bitrouter.yaml" ]; then
  info "installing daemon config"
  mkdir -p "$PROOT_BR"
  cp "$APP_DIR/configs/bitrouter.yaml" "$PROOT_BR/bitrouter.yaml"
fi
ok "daemon config"

# 5. keys ---------------------------------------------------------------
if [ ! -f "$HOME/.secure-credentials/master.env" ]; then
  warn "~/.secure-credentials/master.env missing — daemon will run without provider keys"
fi

# 6. daemon -------------------------------------------------------------
info "daemon :4356"
if curl -s --max-time 2 "$DAEMON_URL/v1/models" >/dev/null 2>&1; then
  ok "already running"
else
  mkdir -p "$HOME/logs/bitrouter"
  bash "$APP_DIR/bin/zesrouter-start" || warn "daemon start returned non-zero — see ~/logs/bitrouter/bitrouter.log"
fi

# 7. ui server ----------------------------------------------------------
info "ui :8080"
UIPORT="${ZESROUTER_UI_PORT:-8080}"
if curl -s --max-time 2 "http://localhost:$UIPORT/api/health" | grep -q ok; then
  ok "already serving"
else
  mkdir -p "$HOME/logs"
  nohup python3 "$UI_DIR/server.py" "$UIPORT" >> "$UI_LOG" 2>&1 &
  sleep 2
  curl -s --max-time 2 "http://localhost:$UIPORT/api/health" | grep -q ok || warn "ui failed to start — see $UI_LOG"
fi
ok "ui"

# 8. done ---------------------------------------------------------------
echo
C 32 "============================================="
C 32 " ZESRouter ready"
LAN_IP=$(ip -4 route get 1 2>/dev/null | grep -oE 'src [0-9.]+' | awk '{print $2}')
C 32 "   UI:      http://localhost:$UIPORT   (LAN: http://${LAN_IP:-<ip>}:$UIPORT)"
C 32 "   Daemon:  $DAEMON_URL  (OpenAI-compatible /v1)"
C 32 "   Repo:    $APP_DIR   (rewind: git -C $APP_DIR pull)"
C 32 "============================================="