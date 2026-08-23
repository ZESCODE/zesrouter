#!/usr/bin/env python3
"""ZESRouter control backend — Python3 stdlib + PyYAML.

Serves the built UI (dist/) + JSON API. Shells out to the BitRouter CLI inside
proot-distro Debian and reads the SQLite DB read-only. No secrets stored.
"""
import json
import os
import re
import shlex
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
from urllib.request import urlopen

try:
    import yaml
except ImportError:
    yaml = None  # type: ignore

import dash_api

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("ZESROUTER_PORT", "8080"))
BR_BIN = os.path.expanduser("~/.local/bin/bitrouter.orig")
PROOT_ROOT = "/data/data/com.termux/files/usr/var/lib/proot-distro/containers/debian/rootfs/root"
CFG_HOST = f"{PROOT_ROOT}/.bitrouter/bitrouter.yaml"
CFG_PROOT = "/root/.bitrouter/bitrouter.yaml"
DB_HOST = f"{PROOT_ROOT}/.bitrouter/bitrouter.db"
DB_PROOT_URL = "sqlite:///root/.bitrouter/bitrouter.db"
CONFIG_DIR = f"{PROOT_ROOT}/.bitrouter"
MASTER_ENV = os.path.expanduser("~/.secure-credentials/master.env")
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")
HEALTH_URL = "http://localhost:4356/health"
AUTH_TOKEN_FILE = os.path.expanduser("~/.secure-credentials/zesrouter-ui.token")

_lock = threading.Lock()


def load_ui_token():
    """Token gating the dashboard API. Env > token file > auto-generate (persisted)."""
    tok = os.environ.get("ZESROUTER_UI_TOKEN", "").strip()
    if tok.lower() in ("open", "none", "off"):
        return ""
    if not tok and os.path.isfile(AUTH_TOKEN_FILE):
        try:
            tok = open(AUTH_TOKEN_FILE).read().strip()
        except OSError:
            tok = ""
    if not tok:
        tok = "zr-" + os.urandom(18).hex()
        try:
            with open(AUTH_TOKEN_FILE, "w") as f:
                f.write(tok + "\n")
            os.chmod(AUTH_TOKEN_FILE, 0o600)
        except OSError:
            pass
    return tok


UI_TOKEN = load_ui_token()


def run_cli(args, with_config=True, timeout=25):
    """Run bitrouter CLI inside proot. Returns (rc, stdout, stderr)."""
    cmd = ["proot-distro", "login", "debian", "--", BR_BIN] + list(args)
    if with_config:
        cmd += ["--config", CFG_PROOT]
    cmd += ["--json"]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return p.returncode, p.stdout.strip(), p.stderr.strip()
    except Exception as e:  # timeout / spawn error
        return -1, "", str(e)


def cli_json(args, with_config=True):
    rc, out, err = run_cli(args, with_config)
    if rc != 0:
        return {"ok": False, "error": (out or err)[:500]}
    i = out.find("{")
    try:
        return {"ok": True, **json.loads(out[i:] if i >= 0 else out)}
    except Exception:
        return {"ok": False, "error": ("bad json: " + out)[:500]}


def daemon_health():
    try:
        with urlopen(HEALTH_URL, timeout=2) as r:
            return json.loads(r.read().decode()) if r.status == 200 else {"status": "down"}
    except Exception:
        return {"status": "down"}


def db_conn(write=False):
    mode = "" if write else "?mode=ro"
    c = sqlite3.connect(f"file:{DB_HOST}{mode}", uri=True, timeout=8)
    if write:
        c.execute("PRAGMA busy_timeout=5000")
    c.row_factory = sqlite3.Row
    return c


def load_config():
    if yaml is None or not os.path.isfile(CFG_HOST):
        return {}
    with open(CFG_HOST) as f:
        return yaml.safe_load(f) or {}


def yaml_load(text):
    if yaml is None:
        raise RuntimeError("PyYAML not installed")
    return yaml.safe_load(text)


def yaml_dump(obj, f):
    if yaml is None:
        raise RuntimeError("PyYAML not installed")
    yaml.safe_dump(obj, f, sort_keys=False, allow_unicode=True)


def env_keys_set():
    """Which provider env vars have a value in master.env (names only, never values)."""
    keys = {}
    if os.path.isfile(MASTER_ENV):
        for line in open(MASTER_ENV):
            m = re.match(r"^\s*([A-Z0-9_]+)=(.+)$", line.strip())
            if m and m.group(2).strip() and not m.group(2).startswith("#"):
                keys[m.group(1)] = True
    return keys


# ---------------------------------------------------------------- handlers

def api_status():
    h = daemon_health()
    st = cli_json(["status"])
    up = st.get("ok") and st.get("running")
    return {
        "daemonRunning": bool(up),
        "health": h,
        "status": st if st.get("ok") else {"error": st.get("error", "CLI unreachable")},
    }


def api_models():
    cfg = load_config()
    tiers = (cfg.get("policy_table") or {}).get("tiers") or {}
    flagship = set(t for t in (tiers.get("flagship") or "").split(",") if t)
    cheap = set(t for t in (tiers.get("cheap") or "").split(",") if t)
    st = cli_json(["models"])
    if not st.get("ok"):
        return {"ok": False, "error": st.get("error")}
    out = []
    hidden = (dash_api.load_state().get("hiddenModels") or {})
    hidden_ids = set()
    for _pid, ids in hidden.items():
        if isinstance(ids, list):
            hidden_ids.update(ids)
    for m in st.get("models", []):
        mid = m["id"]
        if mid in hidden_ids:
            continue
        tier = "flagship" if mid in flagship else "cheap" if mid in cheap else None
        out.append({"id": mid, "providers": m.get("providers", []), "tier": tier})
    return {"ok": True, "models": out}


DEFAULT_ENV = {
    "opencode-zen": "OPENCODE_ZEN_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "github-copilot": "GITHUB_PAT_ZESXDEV",
    "google": "GEMINI_API_KEY",
    "nvidia": "NVIDIA_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "groq": "GROQ_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
}

KEYLESS_PROVIDERS = ("pollinations", "opencode-zen-relay")


def resolve_env_var(pid, cfg=None):
    """Env var a provider's API key lives in (config auth.env > DEFAULT_ENV > <PID>_API_KEY)."""
    if pid in KEYLESS_PROVIDERS:
        return "none"
    p = ((cfg or load_config()).get("providers") or {}).get(pid)
    if isinstance(p, dict) and isinstance(p.get("auth"), dict) and p.get("auth", {}).get("env"):
        return p["auth"]["env"]
    return DEFAULT_ENV.get(pid) or f"{pid.upper().replace('-', '_')}_API_KEY"


def api_provider_key(body):
    """Set/clear an upstream provider API key in master.env. Never echoes the value back."""
    pid = (body or {}).get("providerId", "")
    action = (body or {}).get("action", "set")
    cfg = load_config()
    if pid not in (cfg.get("providers") or {}):
        return {"ok": False, "error": f"unknown provider '{pid}'"}
    env_var = resolve_env_var(pid, cfg)
    if env_var == "none":
        return {"ok": False, "error": f"provider '{pid}' is keyless — nothing to set"}
    if not re.match(r"^[A-Z][A-Z0-9_]*$", env_var):
        return {"ok": False, "error": f"unsafe env var name '{env_var}'"}

    lines = []
    if os.path.isfile(MASTER_ENV):
        with open(MASTER_ENV) as f:
            lines = f.read().splitlines()

    if action == "clear":
        kept = [l for l in lines if not re.match(rf"^\s*{re.escape(env_var)}=", l)]
        if len(kept) == len(lines):
            return {"ok": False, "error": f"{env_var} not present in master.env"}
        lines = kept
        msg = f"{env_var} removed — daemon restart needed to apply"
    else:
        key = str((body or {}).get("key") or "").strip()
        if len(key) < 8 or any(c.isspace() for c in key) or "\x00" in key:
            return {"ok": False, "error": "key looks invalid (min 8 chars, no whitespace)"}
        if len(key) > 2000:
            return {"ok": False, "error": "key too long"}
        replaced = False
        for i, l in enumerate(lines):
            if re.match(rf"^\s*{re.escape(env_var)}=", l):
                lines[i] = f"{env_var}={key}"
                replaced = True
                break
        if not replaced:
            lines.append(f"{env_var}={key}")
        msg = f"{env_var} saved — daemon restart needed to apply"

    try:
        os.chmod(MASTER_ENV, 0o600) if os.path.exists(MASTER_ENV) else None
        with open(MASTER_ENV, "w") as f:
            f.write("\n".join(lines).rstrip("\n") + "\n")
        os.chmod(MASTER_ENV, 0o600)
    except Exception as e:
        return {"ok": False, "error": f"write failed: {e}"}

    if env_var == "NVIDIA_API_KEY":
        threading.Thread(target=restart_bridge, daemon=True).start()
    return {"ok": True, "envVar": env_var, "action": action, "message": msg, "restartNeeded": True}


def restart_bridge():
    """Restart the NVIDIA bridge so it picks up a new NVIDIA_API_KEY."""
    try:
        subprocess.run(["pkill", "-f", "relay/nvidia_bridge.py"], capture_output=True, timeout=10)
    except Exception:
        pass
    try:
        env = {"PATH": os.environ.get("PATH", "/data/data/com.termux/files/usr/bin")}
        if os.path.isfile(MASTER_ENV):
            for line in open(MASTER_ENV):
                m = re.match(r"^\s*([A-Z0-9_]+)=(.+)$", line.strip())
                if m:
                    env[m.group(1)] = m.group(2).strip()
        bridge = os.path.expanduser("~/zesrouter/relay/nvidia_bridge.py")
        subprocess.Popen(
            ["setsid", "-f", "env", "NVIDIA_API_KEY=" + env.get("NVIDIA_API_KEY", ""), "python3", bridge],
            stdin=subprocess.DEVNULL, stdout=open(os.path.expanduser("~/logs/nvidia-bridge.log"), "a"),
            stderr=subprocess.STDOUT,
        )
    except Exception:
        pass


def _restart_daemon():
    try:
        subprocess.run(
            ["timeout", "35", "proot-distro", "login", "debian", "--", "bash", "-c",
             "pkill -f bitrouter.orig; rm -f /root/.bitrouter/bitrouter.sock /root/.bitrouter/bitrouter.pid"],
            capture_output=True, timeout=45)
    except Exception:
        pass
    try:
        subprocess.run(["bash", os.path.expanduser("~/zesrouter/bin/zesrouter-start")],
                       capture_output=True, timeout=120)
    except Exception:
        pass


def api_daemon(body):
    action = body.get("action", "")
    if action == "restart":
        threading.Thread(target=_restart_daemon, daemon=True).start()
        return {"ok": True, "output": "restarting daemon in background", "restarting": True}
    if action not in ("start", "stop", "reload"):
        return {"ok": False, "error": f"bad action {action}"}
    rc, out, err = run_cli([action])
    ok = rc == 0
    msg = out or err
    if action == "reload" and "reload" not in msg.lower():
        msg = "reload command accepted" if ok else msg
    return {"ok": ok, "output": msg[:500]}


def api_providers():
    cfg = load_config()
    envs = env_keys_set()
    providers = (cfg.get("providers") or {})
    out = []
    for pid, p in providers.items():
        auth = p.get("auth") if isinstance(p, dict) else {}
        env_var = auth.get("env") if isinstance(auth, dict) else None
        if not env_var:
            env_var = DEFAULT_ENV.get(pid)
        if pid in ("pollinations", "opencode-zen-relay"):  # keyless providers
            has_key, env_var = True, "none (keyless)"
        else:
            has_key = bool(env_var) and env_var in envs
        out.append({
            "id": pid,
            "name": (p.get("display_name") if isinstance(p, dict) else None) or pid,
            "enabled": bool(p.get("enabled")) if isinstance(p, dict) else True,
            "apiBase": p.get("api_base") if isinstance(p, dict) else None,
            "authEnvVar": env_var or "",
            "hasKey": has_key,
        })
    # 24h stats from DB
    try:
        c = db_conn()
        rows = c.execute("""
            SELECT provider_id,
                   COUNT(*) AS requests,
                   SUM(CASE WHEN error IS NOT NULL AND error != '' THEN 1 ELSE 0 END) AS errors,
                   AVG(latency_ms) AS avg_latency,
                   COALESCE(SUM(estimated_charge_micro_usd), 0) AS cost
            FROM requests
            WHERE created_at >= datetime('now', '-1 day')
            GROUP BY provider_id
        """).fetchall()
        stats = {r["provider_id"]: dict(r) for r in rows}
    except Exception:
        stats = {}
    for p in out:
        s = stats.get(p["id"], {})
        n = s.get("requests") or 0
        e = s.get("errors") or 0
        p["requests"] = n
        p["errors"] = e
        p["errorRate"] = round(e / n * 100, 1) if n else 0
        p["avgLatency"] = round(s["avg_latency"]) if s.get("avg_latency") else None
        p["cost"] = s.get("cost") or 0
    return {"ok": True, "providers": out}


def api_policy():
    cfg = load_config()
    pt = cfg.get("policy_table") or {}
    fp = []
    for state, tier in (pt.get("fingerprints") or {}).items():
        fp.append({"state": state, "tier": tier})
    ad = pt.get("adequacy") or {}
    return {
        "ok": True,
        "policy": {
            "tiers": {
                "cheap": (pt.get("tiers") or {}).get("cheap", ""),
                "flagship": (pt.get("tiers") or {}).get("flagship", ""),
            },
            "fingerprints": fp,
            "default_tier": pt.get("default_tier", "flagship"),
            "tool_use_tier": pt.get("tool_use_tier", "flagship"),
            "adequacy": {"enabled": bool(ad.get("enabled")), "escalation_tier": ad.get("escalation_tier", "flagship")},
        },
    }


def api_requests(qs):
    hours = int(qs.get("hours", ["24"])[0])
    model = qs.get("model", [""])[0]
    provider = qs.get("provider", [""])[0]
    errors_only = qs.get("errors", ["0"])[0] == "1"
    page = max(1, int(qs.get("page", ["1"])[0]))
    size = min(500, max(1, int(qs.get("page_size", ["50"])[0])))

    where = ["created_at >= datetime('now', ?)"]
    args = [f"-{hours} hours"]
    if model:
        where.append("model_id = ?"); args.append(model)
    if provider:
        where.append("provider_id = ?"); args.append(provider)
    if errors_only:
        where.append("error IS NOT NULL AND error != ''")
    wsql = " AND ".join(where)
    try:
        c = db_conn()
        total = c.execute(f"SELECT COUNT(*) FROM requests WHERE {wsql}", args).fetchone()[0]
        cost = c.execute(
            f"SELECT COALESCE(SUM(estimated_charge_micro_usd),0) FROM requests WHERE {wsql}", args
        ).fetchone()[0]
        rows = c.execute(
            f"SELECT * FROM requests WHERE {wsql} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            args + [size, (page - 1) * size],
        ).fetchall()
        models = [r["model_id"] for r in c.execute(
            "SELECT DISTINCT model_id FROM requests WHERE model_id != '' ORDER BY model_id"
        ).fetchall()]
        providers = [r["provider_id"] for r in c.execute(
            "SELECT DISTINCT provider_id FROM requests WHERE provider_id != '' ORDER BY provider_id"
        ).fetchall()]
        return {"ok": True, "total": total, "cost_sum": cost, "page": page, "page_size": size,
                "rows": [dict(r) for r in rows], "models": models, "providers": providers}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def api_stats_dashboard():
    try:
        c = db_conn()
        d = c.execute("""
            SELECT COUNT(*) AS n,
                   COALESCE(SUM(estimated_charge_micro_usd),0) AS cost,
                   AVG(latency_ms) AS lat,
                   COALESCE(SUM(CASE WHEN error IS NOT NULL AND error != '' THEN 1 ELSE 0 END),0) AS errs
            FROM requests WHERE created_at >= datetime('now','-1 day')
        """).fetchone()
        recent = c.execute("""
            SELECT request_id, model_id, provider_id, error, created_at FROM requests
            WHERE error IS NOT NULL AND error != ''
            ORDER BY created_at DESC LIMIT 5
        """).fetchall()
        return {"ok": True, "total": d["n"], "cost_micro": d["cost"], "avg_latency_ms": round(d["lat"]) if d["lat"] else 0,
                "errors": d["errs"], "recent_errors": [dict(r) for r in recent]}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def api_stats_costs():
    """Spend breakdown: by provider, by model, and a 14-day daily series."""
    try:
        c = db_conn()
        by_provider = [dict(r) for r in c.execute("""
            SELECT provider_id, COUNT(*) AS requests,
                   COALESCE(SUM(estimated_charge_micro_usd),0) AS cost_micro,
                   AVG(latency_ms) AS avg_latency_ms
            FROM requests WHERE created_at >= datetime('now','-1 day')
            GROUP BY provider_id ORDER BY cost_micro DESC
        """).fetchall()]
        by_model = [dict(r) for r in c.execute("""
            SELECT model_id, COUNT(*) AS requests,
                   COALESCE(SUM(estimated_charge_micro_usd),0) AS cost_micro
            FROM requests WHERE created_at >= datetime('now','-1 day') AND model_id != ''
            GROUP BY model_id ORDER BY cost_micro DESC LIMIT 30
        """).fetchall()]
        daily = [dict(r) for r in c.execute("""
            SELECT date(created_at) AS day, COUNT(*) AS requests,
                   COALESCE(SUM(estimated_charge_micro_usd),0) AS cost_micro,
                   COALESCE(SUM(CASE WHEN error IS NOT NULL AND error != '' THEN 1 ELSE 0 END),0) AS errors
            FROM requests WHERE created_at >= datetime('now','-13 days')
            GROUP BY day ORDER BY day
        """).fetchall()]
        return {"ok": True, "byProvider": by_provider, "byModel": by_model, "daily": daily}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def api_backup_create():
    """Snapshot config + DB into CONFIG_DIR with timestamp; prune to last 20."""
    ts = time.strftime("%Y%m%d-%H%M%S")
    made = []
    for src_name, src_host in (("bitrouter.yaml", CFG_HOST), ("bitrouter.db", DB_HOST)):
        if not os.path.isfile(src_host):
            continue
        dst = os.path.join(CONFIG_DIR, f"{src_name}.bak-{ts}")
        try:
            shutil.copy2(src_host, dst)
            made.append(os.path.basename(dst))
        except OSError as e:
            return {"ok": False, "error": f"backup {src_name} failed: {e}"}
    snaps = sorted(f for f in os.listdir(CONFIG_DIR) if ".bak-" in f)
    for old in snaps[:-40]:
        try:
            os.remove(os.path.join(CONFIG_DIR, old))
        except OSError:
            pass
    return {"ok": True, "created": made, "totalSnapshots": len(snaps)}


LOG_HOST = os.path.expanduser("~/logs/bitrouter/bitrouter.log")


def api_logs(qs):
    """Tail the daemon log (ANSI stripped). lines=1..1000, level=debug|info|warn|error."""
    lines = min(1000, max(1, int(qs.get("lines", ["200"])[0])))
    level = qs.get("level", [""])[0].lower()
    if not os.path.isfile(LOG_HOST):
        return {"ok": True, "lines": [], "logPath": LOG_HOST}
    raw = open(LOG_HOST, "rb").read().decode(errors="replace")
    raw = re.sub(r"\x1b\[[0-9;]*m", "", raw)
    out = []
    for l in raw.splitlines()[-lines:]:
        m = re.match(r"^(\S+)\s+(\S+)\s+(\S+)\s+(.*)$", l)
        if m:
            ts, lvl, target, msg = m.group(1), m.group(2).strip("[]"), m.group(3), m.group(4)
            if level and lvl.lower() != level:
                continue
            out.append({"ts": ts, "level": lvl, "target": target, "msg": msg[:600]})
    return {"ok": True, "lines": out, "logPath": LOG_HOST}


def api_provider_test(body):
    """End-to-end probe: tiny completion through the daemon on the provider's first model."""
    pid = (body or {}).get("providerId", "")
    cfg = load_config()
    if pid not in (cfg.get("providers") or {}):
        return {"ok": False, "error": f"unknown provider '{pid}'"}
    model = None
    for m, conf in (cfg.get("models") or {}).items():
        ep = conf.get("endpoints") or []
        if isinstance(ep, list) and any(e.get("provider") == pid for e in ep if isinstance(e, dict)):
            model = m
            break
        if isinstance(ep, dict) and ep.get("provider") == pid:
            model = m
            break
    if not model:
        return {"ok": False, "error": f"no model routed through '{pid}'"}
    payload = json.dumps({
        "model": f"{pid}:{model}", "messages": [{"role": "user", "content": "Reply OK"}],
        "max_tokens": 4, "temperature": 0, "stream": False,
    }).encode()
    t0 = time.time()
    import urllib.request
    try:
        r = urllib.request.urlopen(urllib.request.Request(
            "http://localhost:4356/v1/chat/completions", data=payload,
            headers={"Content-Type": "application/json"}), timeout=30)
        body2 = r.read().decode(errors="replace")[:2000]
        lat_ms = round((time.time() - t0) * 1000)
        if r.status == 200:
            return {"ok": True, "providerId": pid, "model": model, "latencyMs": lat_ms, "status": 200}
        return {"ok": False, "providerId": pid, "model": model, "latencyMs": lat_ms,
                "status": r.status, "detail": body2[:300]}
    except Exception as e:
        lat_ms = round((time.time() - t0) * 1000)
        return {"ok": False, "providerId": pid, "model": model, "latencyMs": lat_ms, "detail": str(e)[:300]}


def api_keys():
    c = db_conn()
    rows = c.execute("SELECT * FROM api_keys ORDER BY created_at DESC").fetchall()
    return {"ok": True, "keys": [dict(r) for r in rows]}


def api_key_create(body):
    user = (body.get("label") or "default").strip() or "default"
    # key subcommand does NOT accept --config (run_cli with_config=False)
    rc, out, err = run_cli(["key", "sign", "--user", user, "--db", DB_PROOT_URL], with_config=False)
    if rc != 0:
        return {"ok": False, "error": (out or err)[:500]}
    try:
        parsed = json.loads(out[out.find("{"):]) if "{" in out else {}
        # normalize: CLI returns {id, secret, hash_stored} → expose as {id, plaintext, secret}
        if "secret" in parsed and "plaintext" not in parsed:
            parsed["plaintext"] = parsed["secret"]
        return {"ok": True, "result": parsed}
    except Exception:
        return {"ok": True, "result": {"raw": out[:500]}}


def api_key_revoke(body):
    kid = body.get("id")
    if not kid:
        return {"ok": False, "error": "missing id"}
    try:
        c = db_conn(write=True)
        c.execute("UPDATE api_keys SET active = 0 WHERE id = ?", (kid,))
        c.commit()
        return {"ok": True, "revoked": kid}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def api_provider_add(body):
    """Add a new provider entry to bitrouter.yaml. Creates minimal third-party-api provider."""
    pid = str((body or {}).get("id") or "").strip()
    display = str((body or {}).get("displayName") or "").strip()
    api_base = str((body or {}).get("apiBase") or "").strip()
    auth_env = str((body or {}).get("authEnv") or "").strip()
    enabled = body.get("enabled", True)

    if not pid or not re.match(r"^[a-zA-Z0-9._-]+$", pid):
        return {"ok": False, "error": "invalid provider id — use a-z, 0-9, . _ -"}
    if len(pid) > 64:
        return {"ok": False, "error": "provider id too long (max 64)"}
    if api_base and not re.match(r"^https?://", api_base):
        return {"ok": False, "error": "apiBase must start with http:// or https://"}
    if auth_env and auth_env != "none" and not re.match(r"^[A-Z][A-Z0-9_]*$", auth_env):
        return {"ok": False, "error": "authEnv must be UPPER_SNAKE or 'none'"}

    cfg = load_config()
    providers = cfg.get("providers") or {}
    if pid in providers:
        return {"ok": False, "error": f"provider '{pid}' already exists"}

    entry: dict = {"enabled": bool(enabled)}
    if display:
        entry["display_name"] = display
    else:
        entry["display_name"] = pid
    # default to third-party-api if apiBase given
    if api_base:
        entry["id"] = pid
        entry["class"] = "third-party-api"
        entry["api_base"] = api_base
        entry["protocol_endpoints"] = {"chat_completions": api_base}
    if auth_env and auth_env != "none":
        entry["auth"] = {"kind": "bearer", "env": auth_env}
    elif auth_env == "none":
        # explicitly keyless — no auth
        pass

    providers[pid] = entry
    cfg["providers"] = providers

    # backup before write
    try:
        ts = time.strftime("%Y%m%d-%H%M%S")
        if os.path.isfile(CFG_HOST):
            shutil.copy2(CFG_HOST, os.path.join(CONFIG_DIR, f"bitrouter.yaml.bak-{ts}"))
    except Exception:
        pass

    try:
        with open(CFG_HOST, "w") as f:
            yaml_dump(cfg, f)
    except Exception as e:
        return {"ok": False, "error": f"write failed: {e}"}

    # reload daemon async — don't block handler _lock
    try:
        threading.Thread(target=lambda: api_daemon({"action": "reload"}), daemon=True).start()
    except Exception:
        pass
    return {"ok": True, "providerId": pid, "message": f"provider '{pid}' added — reload queued"}


def api_provider_remove(body):
    """Remove provider from bitrouter.yaml and clean model routes referencing it."""
    pid = str((body or {}).get("id") or "").strip()
    if not pid:
        return {"ok": False, "error": "missing provider id"}
    cfg = load_config()
    providers = cfg.get("providers") or {}
    if pid not in providers:
        return {"ok": False, "error": f"provider '{pid}' not found"}

    # prevent removing last provider? allow but warn
    del providers[pid]
    cfg["providers"] = providers

    # clean model endpoints referencing this provider
    models = cfg.get("models") or {}
    cleaned = 0
    removed_models = []
    for mid, mconf in list(models.items()):
        eps = mconf.get("endpoints")
        if isinstance(eps, list):
            new_eps = [e for e in eps if isinstance(e, dict) and e.get("provider") != pid]
            if len(new_eps) != len(eps):
                cleaned += len(eps) - len(new_eps)
                if new_eps:
                    mconf["endpoints"] = new_eps
                else:
                    # no endpoints left — remove model entry
                    del models[mid]
                    removed_models.append(mid)
        elif isinstance(eps, dict) and eps.get("provider") == pid:
            del models[mid]
            removed_models.append(mid)
            cleaned += 1
    cfg["models"] = models

    try:
        ts = time.strftime("%Y%m%d-%H%M%S")
        if os.path.isfile(CFG_HOST):
            shutil.copy2(CFG_HOST, os.path.join(CONFIG_DIR, f"bitrouter.yaml.bak-{ts}"))
    except Exception:
        pass

    try:
        with open(CFG_HOST, "w") as f:
            yaml_dump(cfg, f)
    except Exception as e:
        return {"ok": False, "error": f"write failed: {e}"}

    try:
        threading.Thread(target=lambda: api_daemon({"action": "reload"}), daemon=True).start()
    except Exception:
        pass

    msg = f"provider '{pid}' removed"
    if cleaned:
        msg += f" — cleaned {cleaned} endpoint(s)"
    if removed_models:
        msg += f" — removed models: {', '.join(removed_models[:3])}" + ("…" if len(removed_models) > 3 else "")
    return {"ok": True, "providerId": pid, "message": msg}


def api_config_save(body, reload_after):
    yaml_text = body.get("yaml", "")
    if not yaml_text.strip():
        return {"ok": False, "error": "empty config"}
    try:
        yaml_load(yaml_text)  # syntax gate
    except Exception as e:
        return {"ok": False, "error": f"yaml invalid: {e}"}
    with open(CFG_HOST, "w") as f:
        f.write(yaml_text)
    if reload_after:
        return api_daemon({"action": "reload"})
    return {"ok": True, "saved": CFG_HOST}


def api_config_validate(body):
    yaml_text = body.get("yaml", "")
    try:
        yaml_load(yaml_text)
    except Exception as e:
        return {"ok": False, "error": f"yaml invalid: {e}"}
    tmp_host = f"/data/data/com.termux/files/usr/tmp/zr-validate-{os.getpid()}.yaml"
    tmp_proot = f"/data/data/com.termux/files/usr/tmp/zr-validate-{os.getpid()}.yaml"
    with open(tmp_host, "w") as f:
        f.write(yaml_text)
    try:
        rc, out, err = run_cli(["config", "validate", "--config", tmp_proot], with_config=False)
        if rc != 0 and "unexpected argument" in (out + err):
            rc, out, err = run_cli(["config", "validate", "-c", tmp_proot], with_config=False)
        return {"ok": rc == 0, "output": (out or err)[:800]}
    finally:
        try:
            os.remove(tmp_host)
        except OSError:
            pass


def api_backups():
    items = []
    for name in sorted(os.listdir(CONFIG_DIR)):
        if ".bak-" in name:
            p = os.path.join(CONFIG_DIR, name)
            items.append({"name": name, "mtime": time.strftime("%Y-%m-%d %H:%M", time.localtime(os.path.getmtime(p)))})
    return {"ok": True, "backups": items}


def api_backup_restore(body):
    name = body.get("name", "")
    if not name or ".." in name or not name.startswith("bitrouter.yaml.bak"):
        return {"ok": False, "error": "invalid backup name"}
    src = os.path.join(CONFIG_DIR, name)
    if not os.path.isfile(src):
        return {"ok": False, "error": "backup not found"}
    shutil.copy(src, CFG_HOST)
    return api_daemon({"action": "reload"})


# ---------------------------------------------------------------- HTTP glue

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read_body(self):
        n = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(n) if n else b"{}"
        try:
            return json.loads(raw) if raw else {}
        except Exception:
            return {"raw": raw.decode(errors="replace")[:4000]}

    def _static(self):
        path = urlparse(self.path).path
        if path in ("/", ""):
            path = "/index.html"
        fp = os.path.normpath(os.path.join(STATIC_DIR, path.lstrip("/")))
        if not fp.startswith(os.path.normpath(STATIC_DIR) + os.sep) and fp != os.path.normpath(STATIC_DIR):
            self._json(403, {"ok": False, "error": "forbidden"})
            return
        if os.path.isfile(fp):
            ctype = (
                "text/html" if fp.endswith(".html")
                else "application/javascript" if fp.endswith(".js")
                else "text/css" if fp.endswith(".css")
                else "application/manifest+json" if fp.endswith(".webmanifest")
                else "application/json" if fp.endswith(".json")
                else "image/svg+xml" if fp.endswith(".svg")
                else "application/octet-stream"
            )
            data = open(fp, "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            self._json(404, {"ok": False, "error": f"not built yet — run `npm run build` in ui/ (missing {path})"})

    def do_GET(self):
        with _lock:
            u = urlparse(self.path)
            if u.path.startswith("/api/"):
                self._route_api(u, None)
            else:
                self._static()

    def do_POST(self):
        with _lock:
            u = urlparse(self.path)
            self._route_api(u, self._read_body())

    def _playground(self, body):
        stream = bool((body or {}).get("stream", True))
        try:
            upstream = dash_api.playground_request(body or {}, timeout=90)
        except Exception as e:
            self._json(502, {"ok": False, "error": str(e)[:400]})
            return
        ctype = upstream.headers.get("Content-Type", "application/json")
        self.send_response(upstream.status)
        self.send_header("Content-Type", ctype)
        if stream:
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Accel-Buffering", "no")
        self.end_headers()
        try:
            while True:
                chunk = upstream.read(1024)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except Exception:
            pass
        try:
            upstream.close()
        except Exception:
            pass

    def _authorized(self):
        """Bearer token check for API routes. Static assets stay public."""
        if not UI_TOKEN:
            return True
        auth = self.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            import hmac
            return hmac.compare_digest(auth[7:].strip(), UI_TOKEN)
        return False

    def _route_api(self, u, body):
        if not self._authorized():
            self._json(401, {"ok": False, "error": "unauthorized"})
            return
        p = u.path
        qs = parse_qs(u.query)
        try:
            if p == "/api/health":
                self._json(200, daemon_health())
            elif p == "/api/status":
                self._json(200, api_status())
            elif p == "/api/models":
                self._json(200, api_models())
            elif p == "/api/route":
                model = (body or {}).get("model", "")
                if not model:
                    self._json(400, {"ok": False, "error": "missing model"})
                else:
                    rc, out, err = run_cli(["route", model])
                    self._json(200, {"ok": rc == 0, "result": (out or err)[:500]})
            elif p == "/api/providers":
                self._json(200, api_providers())
            elif p == "/api/providers/key":
                self._json(200, api_provider_key(body or {}))
            elif p == "/api/providers/add":
                self._json(200, api_provider_add(body or {}))
            elif p == "/api/providers/remove":
                self._json(200, api_provider_remove(body or {}))
            elif p == "/api/policy":
                self._json(200, api_policy())
            elif p == "/api/requests":
                self._json(200, api_requests(qs))
            elif p == "/api/stats/dashboard":
                self._json(200, api_stats_dashboard())
            elif p == "/api/stats/costs":
                self._json(200, api_stats_costs())
            elif p == "/api/logs":
                self._json(200, api_logs(qs))
            elif p == "/api/backups/create":
                self._json(200, api_backup_create())
            elif p == "/api/providers/test":
                self._json(200, api_provider_test(body or {}))
            elif p == "/api/keys" and self.command == "GET":
                self._json(200, api_keys())
            elif p == "/api/keys/create":
                self._json(200, api_key_create(body or {}))
            elif p == "/api/keys/revoke":
                self._json(200, api_key_revoke(body or {}))
            elif p == "/api/config" and self.command == "GET":
                with open(CFG_HOST) as f:
                    self._json(200, {"ok": True, "yaml": f.read()})
            elif p == "/api/config/validate":
                self._json(200, api_config_validate(body or {}))
            elif p == "/api/config/save":
                self._json(200, api_config_save(body or {}, reload_after=bool((body or {}).get("reload"))))
            elif p == "/api/backups":
                self._json(200, api_backups())
            elif p == "/api/backups/restore":
                self._json(200, api_backup_restore(body or {}))
            elif p == "/api/daemon":
                self._json(200, api_daemon(body or {}))
            elif p == "/api/dash/state" and self.command == "GET":
                self._json(200, {"ok": True, "state": dash_api.load_state()})
            elif p == "/api/dash/state":
                st = (body or {}).get("state") if isinstance(body, dict) else None
                self._json(200, {"ok": True, "state": dash_api.save_state(st or {})})
            elif p == "/api/dash/export":
                self._json(200, dash_api.api_export(CFG_HOST, DB_HOST))
            elif p == "/api/dash/import":
                self._json(200, dash_api.api_import(body or {}, CFG_HOST))
            elif p == "/api/health/metrics":
                self._json(200, dash_api.api_metrics(db_conn))
            elif p == "/api/agents":
                self._json(200, dash_api.api_agents())
            elif p == "/api/oauth/repair":
                self._json(200, dash_api.api_oauth_repair(body or {}, MASTER_ENV))
            elif p == "/api/cli-tools":
                self._json(200, dash_api.api_cli_tools(body or {}))
            elif p == "/api/playground":
                self._playground(body or {})
            else:
                self._json(404, {"ok": False, "error": f"no such endpoint {p}"})
        except Exception as e:
            self._json(500, {"ok": False, "error": str(e)})


if __name__ == "__main__":
    print(f"ZESRouter UI — http://localhost:{PORT} (static: {STATIC_DIR})")
    if UI_TOKEN:
        print(f"Dashboard API token: {UI_TOKEN}  (see ~/.secure-credentials/zesrouter-ui.token)")
    else:
        print("WARNING: dashboard API is OPEN (no token configured)")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()