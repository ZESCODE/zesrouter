"""Dashboard extras — persisted state, metrics, playground proxy, CLI snippets."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from typing import Any

HOST_DIR = os.path.expanduser("~/.zesrouter")
STATE_PATH = os.path.join(HOST_DIR, "dashboard-state.json")
DAEMON = "http://127.0.0.1:4356"

BUILTIN_AGENTS = [
    ("codex", "codex"),
    ("claude", "claude"),
    ("goose", "goose"),
    ("gemini-cli", "gemini"),
    ("openclaw", "openclaw"),
    ("aider", "aider"),
    ("opencode", "opencode"),
    ("cline", "cline"),
    ("qwen-code", "qwen"),
    ("forgecode", "forge"),
    ("amazon-q", "q"),
    ("open-interpreter", "interpreter"),
    ("cursor-cli", "cursor"),
    ("warp", "warp"),
]

OAUTH_ENV = {
    "claude-code": ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"],
    "claude": ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"],
    "codex": ["OPENAI_API_KEY", "CODEX_API_KEY"],
    "gemini-cli": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    "gemini": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    "qoder": ["QODER_TOKEN"],
}

CLI_SNIPPETS = {
    "claude-code": lambda: json.dumps({
        "env": {"ANTHROPIC_BASE_URL": "http://127.0.0.1:4356", "ANTHROPIC_API_KEY": "zesrouter"},
    }, indent=2),
    "codex": lambda: (
        'model = "opencode/muse-spark-1.2-contributor-free"\n'
        'model_provider = "zesrouter"\n\n'
        "[model_providers.zesrouter]\n"
        'name = "ZESRouter"\n'
        'base_url = "http://127.0.0.1:4356/v1"\n'
        'wire_api = "chat"\n'
    ),
    "gemini": lambda: json.dumps({"baseUrl": "http://127.0.0.1:4356/v1", "apiKey": "zesrouter"}, indent=2),
    "openclaw": lambda: json.dumps({"provider": "openai", "baseURL": "http://127.0.0.1:4356/v1"}, indent=2),
    "kilo": lambda: json.dumps({"openaiBaseUrl": "http://127.0.0.1:4356/v1"}, indent=2),
    "antigravity": lambda: json.dumps({"endpoint": "http://127.0.0.1:4356/v1"}, indent=2),
    "cline": lambda: json.dumps({"openAiBaseUrl": "http://127.0.0.1:4356/v1", "openAiApiKey": "zesrouter"}, indent=2),
    "continue": lambda: json.dumps({
        "models": [{"title": "ZESRouter", "provider": "openai", "model": "AUTODETECT",
                    "apiBase": "http://127.0.0.1:4356/v1", "apiKey": "zesrouter"}],
    }, indent=2),
    "cursor": lambda: json.dumps({"mcpServers": {"zesrouter": {"url": "http://127.0.0.1:4356/mcp"}}}, indent=2),
    "factory": lambda: json.dumps({"base_url": "http://127.0.0.1:4356/v1"}, indent=2),
}


def _ensure_dir() -> None:
    os.makedirs(HOST_DIR, exist_ok=True)


def default_state() -> dict[str, Any]:
    return {
        "combos": [],
        "hiddenModels": {},
        "customAgents": [],
        "webhooks": [],
        "context": {"enabled": True, "handoffThreshold": 85, "maxMessages": 24, "summaryModel": "", "injectAsSystem": True},
        "settings": {
            "appearance": {"theme": "dark", "accent": "blue", "customHex": "#3b82f6", "showHealthLog": True, "sidebar": "auto"},
            "security": {"protectEndpoint": True, "blockedProviders": [], "ipAllow": "", "ipDeny": ""},
            "resilience": {"persistRateLimits": True, "cbFailures": 5, "cbCooldownSec": 30, "autoDisableBanned": True, "watchExpiration": True, "relayThreshold": 85},
            "aliases": {},
            "degradeBackground": True,
            "fallbackDegrade": True,
            "auditEnabled": True,
            "proxyUrl": "",
            "proxyEnforce": False,
            "tokenHealthCheck": True,
            "oauthRefresh": True,
            "compressionDefault": "rtk",
            "compressionLevel": 2,
        },
        "freeEnabled": {},
        "cooldown": {},
        "lockout": {},
    }


def load_state() -> dict[str, Any]:
    _ensure_dir()
    base = default_state()
    if os.path.isfile(STATE_PATH):
        try:
            data = json.loads(open(STATE_PATH).read())
            if isinstance(data, dict):
                base.update(data)
                if isinstance(data.get("settings"), dict):
                    merged = default_state()["settings"]
                    merged.update(data["settings"])
                    base["settings"] = merged
        except Exception:
            pass
    return base


def save_state(state: dict[str, Any]) -> dict[str, Any]:
    _ensure_dir()
    cur = load_state()
    cur.update(state or {})
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(cur, f, indent=2)
    os.replace(tmp, STATE_PATH)
    return cur


def percentile(values: list[float], p: float) -> int:
    if not values:
        return 0
    xs = sorted(values)
    i = min(len(xs) - 1, max(0, int(round((p / 100) * (len(xs) - 1)))))
    return int(xs[i])


def api_metrics(db_conn) -> dict[str, Any]:
    p50 = p95 = p99 = 0
    cache_read = cache_write = 0
    hit = 0.0
    try:
        c = db_conn()
        rows = [r[0] for r in c.execute(
            "SELECT latency_ms FROM requests WHERE created_at >= datetime('now','-1 day') AND latency_ms IS NOT NULL"
        ).fetchall()]
        p50, p95, p99 = percentile(rows, 50), percentile(rows, 95), percentile(rows, 99)
        agg = c.execute(
            """SELECT COALESCE(SUM(cache_read_tokens),0), COALESCE(SUM(cache_write_tokens),0),
                      COALESCE(SUM(prompt_tokens),0)
               FROM requests WHERE created_at >= datetime('now','-1 day')"""
        ).fetchone()
        cache_read, cache_write, prompt = int(agg[0]), int(agg[1]), int(agg[2] or 0)
        hit = (cache_read / prompt) if prompt else 0.0
    except Exception:
        pass
    mem = 0
    try:
        import resource
        mem = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)
    except Exception:
        pass
    return {
        "ok": True,
        "p50": p50,
        "p95": p95,
        "p99": p99,
        "cacheHit": round(hit, 3),
        "cacheRead": cache_read,
        "cacheWrite": cache_write,
        "quotaSessions": 0,
        "memoryMb": mem,
        "version": "1.0.0-alpha.27",
    }


def which(bin_name: str) -> str | None:
    return shutil.which(bin_name)


def api_agents() -> dict[str, Any]:
    out = []
    for aid, binary in BUILTIN_AGENTS:
        path = which(binary)
        ver = None
        if path:
            try:
                p = subprocess.run([binary, "--version"], capture_output=True, text=True, timeout=3)
                ver = (p.stdout or p.stderr).strip().splitlines()[0][:80] if (p.stdout or p.stderr) else "ok"
            except Exception:
                ver = "ok"
        out.append({"id": aid, "installed": bool(path), "version": ver, "fingerprint": binary})
    return {"ok": True, "agents": out}


def api_oauth_repair(body: dict[str, Any], master_env: str) -> dict[str, Any]:
    pid = str((body or {}).get("providerId") or "")
    envs = OAUTH_ENV.get(pid) or OAUTH_ENV.get(pid.replace("_", "-")) or []
    if not envs:
        return {"ok": False, "error": f"no oauth env map for '{pid}'"}
    lines = []
    if os.path.isfile(master_env):
        lines = open(master_env).read().splitlines()
    added = []
    for ev in envs:
        if not any(l.startswith(ev + "=") for l in lines):
            lines.append(f"{ev}=")
            added.append(ev)
    os.makedirs(os.path.dirname(master_env), exist_ok=True)
    with open(master_env, "w") as f:
        f.write("\n".join(lines).rstrip("\n") + "\n")
    try:
        os.chmod(master_env, 0o600)
    except OSError:
        pass
    return {"ok": True, "message": f"repaired {', '.join(added) or 'already present'}: {', '.join(envs)}"}


def api_cli_tools(body: dict[str, Any]) -> dict[str, Any]:
    tid = str((body or {}).get("toolId") or "")
    action = str((body or {}).get("action") or "apply")
    gen = CLI_SNIPPETS.get(tid)
    if not gen:
        return {"ok": False, "error": f"unknown tool {tid}"}
    snippet = gen()
    dest_dir = os.path.join(HOST_DIR, "cli-profiles")
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, f"{tid}.snippet")
    bak = dest + ".bak"
    if action == "reset":
        if os.path.isfile(bak):
            shutil.copy2(bak, dest)
            return {"ok": True, "message": "reset", "preview": open(dest).read()}
        if os.path.isfile(dest):
            os.remove(dest)
        return {"ok": True, "message": "cleared", "preview": ""}
    if os.path.isfile(dest):
        shutil.copy2(dest, bak)
    with open(dest, "w") as f:
        f.write(snippet)
    return {"ok": True, "message": f"wrote {dest}", "preview": snippet}


def api_export(cfg_host: str, db_host: str) -> dict[str, Any]:
    yaml_text = ""
    if os.path.isfile(cfg_host):
        yaml_text = open(cfg_host).read()
    return {"ok": True, "exportedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "state": load_state(), "yaml": yaml_text, "dbPresent": os.path.isfile(db_host)}


def api_import(body: dict[str, Any], cfg_host: str) -> dict[str, Any]:
    st = (body or {}).get("state")
    if isinstance(st, dict):
        save_state(st)
    yaml_text = (body or {}).get("yaml")
    if isinstance(yaml_text, str) and yaml_text.strip() and os.path.isdir(os.path.dirname(cfg_host)):
        with open(cfg_host, "w") as f:
            f.write(yaml_text)
    return {"ok": True}


def playground_request(body: dict[str, Any], timeout: int = 90):
    endpoint = str((body or {}).get("endpoint") or "/v1/chat/completions")
    if not endpoint.startswith("/"):
        endpoint = "/" + endpoint
    payload = {
        "model": (body or {}).get("model") or "opencode/muse-spark-1.2-contributor-free",
        "messages": (body or {}).get("messages") or [{"role": "user", "content": "hi"}],
        "stream": bool((body or {}).get("stream", True)),
        "max_tokens": int((body or {}).get("max_tokens") or 256),
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        DAEMON + endpoint,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    return urllib.request.urlopen(req, timeout=timeout)
