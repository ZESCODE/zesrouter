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
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
from urllib.request import urlopen

import yaml

PORT = int(os.environ.get("ZESROUTER_PORT", "8080"))
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

_lock = threading.Lock()


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
    with open(CFG_HOST) as f:
        return yaml.safe_load(f) or {}


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
    for m in st.get("models", []):
        mid = m["id"]
        tier = "flagship" if mid in flagship else "cheap" if mid in cheap else None
        out.append({"id": mid, "providers": m.get("providers", []), "tier": tier})
    return {"ok": True, "models": out}


DEFAULT_ENV = {
    "opencode-zen": "OPENCODE_ZEN_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "github-copilot": "GITHUB_PAT_ZESXDEV",
    "google": "GEMINI_API_KEY",
}


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
        if pid == "pollinations":  # keyless provider
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


def api_keys():
    c = db_conn()
    rows = c.execute("SELECT * FROM api_keys ORDER BY created_at DESC").fetchall()
    return {"ok": True, "keys": [dict(r) for r in rows]}


def api_key_create(body):
    user = (body.get("label") or "default").strip() or "default"
    rc, out, err = run_cli(["key", "sign", "--user", user, "--db", DB_PROOT_URL])
    if rc != 0:
        return {"ok": False, "error": (out or err)[:500]}
    try:
        return {"ok": True, "result": json.loads(out[out.find("{"):])}
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


def api_config_save(body, reload_after):
    yaml_text = body.get("yaml", "")
    if not yaml_text.strip():
        return {"ok": False, "error": "empty config"}
    try:
        yaml.safe_load(yaml_text)  # syntax gate
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
        yaml.safe_load(yaml_text)
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


def api_daemon(body):
    action = body.get("action", "")
    if action not in ("start", "stop", "reload"):
        return {"ok": False, "error": f"bad action {action}"}
    rc, out, err = run_cli([action])
    ok = rc == 0
    msg = out or err
    if action == "reload" and "reload" not in msg.lower():
        msg = "reload command accepted" if ok else msg
    return {"ok": ok, "output": msg[:500]}


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
            ctype = "text/html" if fp.endswith(".html") else "application/javascript" if fp.endswith(".js") else "text/css" if fp.endswith(".css") else "application/json" if fp.endswith(".json") else "image/svg+xml" if fp.endswith(".svg") else "application/octet-stream"
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

    def _route_api(self, u, body):
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
            elif p == "/api/policy":
                self._json(200, api_policy())
            elif p == "/api/requests":
                self._json(200, api_requests(qs))
            elif p == "/api/stats/dashboard":
                self._json(200, api_stats_dashboard())
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
            else:
                self._json(404, {"ok": False, "error": f"no such endpoint {p}"})
        except Exception as e:
            self._json(500, {"ok": False, "error": str(e)})


if __name__ == "__main__":
    print(f"ZESRouter UI — http://localhost:{PORT} (static: {STATIC_DIR})")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()