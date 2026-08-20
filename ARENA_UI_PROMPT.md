# ZESRouter Web UI — Build Prompt (for Claude/Sonnet on arena.ai)

You are building the management UI for **ZESRouter** — a ZES-branded packaging of
BitRouter 1.0.0-alpha.27 (Apache-2.0), an LLM router daemon. Repo: github.com/zesxdev/zesrouter
(local: `~/zesrouter`). The daemon runs inside proot-distro Debian on a Termux/Android
phone, listens at `http://localhost:4356/v1` (OpenAI + Anthropic compatible).
Your job: a self-contained web UI + tiny backend, source-only, no secrets, no binary
bundling. Do NOT touch the BitRouter binary, its SQLite schema, or proot internals —
you consume the daemon's HTTP API, its CLI, and its SQLite DB read-only.

Services running on the host:
- 4356 — BitRouter daemon HTTP (OpenAI-compatible: /v1/models, /v1/chat/completions, /v1/responses, /health -> {"status":"ok"})

## Data sources (verified live)

### 1. Daemon HTTP API (port 4356)
- `GET /health` -> `{"status":"ok"}`
- `GET /v1/models` -> OpenAI-format model list (9 models currently: anthropic/claude-sonnet-5, deepseek/deepseek-v4-flash-free, pollinations/*, openrouter/google/gemma-4-31b-it:free, openrouter/nvidia/nemotron-nano-12b-v2-vl:free)

### 2. BitRouter CLI (must be run inside proot, ALWAYS with --config)
```bash
# from Termux, the CLI is:
proot-distro login debian -- /data/data/com.termux/files/home/.local/bin/bitrouter.orig <cmd> --config /root/.bitrouter/bitrouter.yaml --json
```
Working commands (all emit JSON by default — do not pass --human):
- `status` -> {"running":true,"pid":...,"listen":"0.0.0.0:4356","models":9,"socket":...}
- `models` -> {"models":[{"id":"...","providers":["..."]},...]}  (routing table: model -> provider chain)
- `route <model>` -> resolved route for a model (endpoint decision) — used for "test route"
- `key list` / `key create` / `key revoke` — virtual keys
- `policy` — policy management
- `config --validate` (or `config validate`) — config validation
- `reload` — hot-reload daemon config; `stop`/`start` — daemon lifecycle
- `observe` — observability status (OTel)

### 3. SQLite DB (read-only, best accessed with Python3's stdlib sqlite3 — no sqlite3 binary needed)
Path (Termux-visible): `/data/data/com.termux/files/usr/var/lib/proot-distro/containers/debian/rootfs/root/.bitrouter/bitrouter.db`
Open read-only: `sqlite3.connect('file:...?mode=ro', uri=True)` (daemon holds the DB; open non-exclusive).
Tables (verified):
- `requests` (5595 rows) — cols: request_id, user_id, api_key_id, model_id, provider_id, prompt_tokens, completion_tokens, reasoning_tokens, cache_read_tokens, cache_write_tokens, estimated_charge_micro_usd (micro-USD), streamed, latency_ms, generation_time_ms, error (nullable — upstream failure text), created_at (RFC3339 string)
- `api_keys` — id, key_hash, user_id, spend_limit_micro_usd, rpm_limit, policy_id, expires_at, active, created_at
- `adequacy_pins`, `adequacy_exploration` (fingerprint, observed, adequate_trials, locked), `adequacy_semantic_success` — self-improvement state
- `users` (unused, 0 rows)

### 4. Config file
`/data/data/com.termux/files/usr/var/lib/proot-distro/containers/debian/rootfs/root/.bitrouter/bitrouter.yaml`
Sections: server (listen, skip_auth), providers (opencode-zen, openai, anthropic, openrouter, github-copilot, pollinations — each with enabled, auth kind/env), models (id -> endpoints: provider+service_id lists), policy_table (tiers cheap/flagship, fingerprints opening/after_read_file/after_write_file/after_search_files/after_terminal/midstream/after_tool_error/after_delegate_task, default_tier, tool_use_tier, tool_safe_tiers, adequacy{enabled, escalation_tier}), plugins (bitrouter-observe OTel).

## Stack (keep minimal — runs on Termux, no native builds)

- **Backend**: Python 3 stdlib ONLY (`http.server` + `sqlite3` + `subprocess` + `yaml` if available; if PyYAML missing, parse policy_table/providers with a small tolerant parser or shell out to the CLI for JSON data instead of parsing YAML). Serves static UI + JSON API. No pip-installed native modules. Single file `server.py`.
- **Frontend**: single-page app, vanilla JS + one HTML file + one CSS file (dark terminal aesthetic, ZES brand = amber/green on near-black), served by the same backend. PWA: manifest.json + service worker (offline cache of app shell). No framework, no build step — arena.ai output must run with `python3 server.py` and open on :8080. (If you insist on React, it must be pre-built static output committed to the repo — no node_modules in git.)
- Directory: everything under `~/zesrouter/ui/` (server.py at `ui/server.py`, web root `ui/static/`).

## Pages to build (7)

### 1. Dashboard
- Status card: health badge (poll /health every 10s), pid, listen address, model count, config name. Sources: /health + CLI `status`.
- 24h stats from SQLite: total requests, total cost (sum estimated_charge_micro_usd -> USD), avg latency_ms, error count/error rate.
- Tier split: requests grouped by model -> cheap vs flagship tier (match model ids against policy_table tiers).
- Top 5 models by request count (last 24h) with mini bars.
- Recent 5 errors: time, model, error prefix (truncate 120 chars).

### 2. Models (Routing)
- Table of routing table (CLI `models`): id | provider chain (badges, fallback order) | tier tag.
- "Test route" box: type a model id -> POST /api/route -> show resolved provider/endpoint. 404-ish result shown inline, never crashes page.
- Note under table: "Routing table is edited in Settings → Config (YAML), then Reload".

### 3. Providers
- Cards, one per provider (from config): name, enabled toggle status (read-only display), api_base (if present), auth (env var name — show ONLY "key set"/"key missing", never values).
- Per-provider live stats (SQLite, last 24h): requests, success count, error count, avg latency, cost.
- Sort by error rate descending; error rate > 20% gets red border.

### 4. Policy
- Render policy_table as structured cards: Tiers (cheap/flagship -> model id), Fingerprints (state -> tier, e.g. "after_terminal -> cheap"), default_tier, tool_use_tier, adequacy block (enabled + escalation_tier).
- Read-only in v1 (edit via Settings → Config). "Reload daemon" button here too.

### 5. Keys (Virtual API keys)
- Table (SQLite api_keys): id, key_hash (mask: show first 8 chars), rpm_limit, spend_limit_micro_usd (as USD), expires_at, active badge.
- "Create key" form: name/scope inputs -> POST /api/keys/create (shells out `key create --json`) -> show plaintext key ONCE in a copy box.
- "Revoke" per row (confirm dialog).

### 6. Traffic (Request log)
- Filters: time range (last 1h / 6h / 24h / 7d / custom), model (select from distinct), provider (select), errors-only checkbox.
- Table: created_at (local time), model_id, provider_id, prompt+completion tokens, cost (USD, from micro), latency_ms, streamed, error (truncated 100 chars, red row bg).
- Pagination: 50/page. Total row count + sum cost footer.
- Sparkline (request count per hour, last 24h, tiny inline SVG — no chart lib).

### 7. Settings
- Config viewer: read config file, show in <textarea> (monospace). Edit allowed — "Validate" button (CLI `config` validate), "Save + Reload" button (write file, then CLI `reload`). Show CLI output (stdout tail) in a result box.
- Backups list: scan config dir for bitrouter.yaml.bak-* — list with timestamp, "restore" button (copy over live config, then reload). Confirm dialog.
- Danger zone (bottom): Stop / Start daemon buttons (CLI stop/start), compact.

## Backend API contract (server.py)

```
GET  /api/health           -> probe :4356/health  {"status":"ok"|"down"}
GET  /api/status           -> CLI status --json (mapped, plus daemon reachability)
GET  /api/models           -> CLI models --json
POST /api/route  {model}   -> CLI route <model> --json
GET  /api/providers        -> config providers + 24h DB stats per provider
GET  /api/policy           -> policy_table from config
GET  /api/keys             -> sqlite api_keys
POST /api/keys/create      {label?} -> CLI key create --json (return plaintext once)
POST /api/keys/revoke      {id}     -> CLI key revoke
GET  /api/requests         -> queries: from,to,model,provider,errors_only,page,page_size -> {rows,total,cost_sum}
GET  /api/stats/dashboard  -> 24h aggregates + tier split + top models + recent errors
GET  /api/config           -> raw yaml text
POST /api/config/validate  {yaml}  -> CLI/parser validation result
POST /api/config/save      {yaml, reload:bool} -> write + optional CLI reload
GET  /api/backups          -> [{name, mtime}]
POST /api/backups/restore  {name}  -> copy + reload
POST /api/daemon           {action: start|stop|reload} -> CLI result
```

Rules for shell-outs: always `proot-distro login debian -- /data/data/com.termux/files/home/.local/bin/bitrouter.orig <cmd> --config /root/.bitrouter/bitrouter.yaml --json`; 15s timeout; capture stderr too; never interpolate user input into the shell command without shlex.quote; return {ok, stdout, stderr}.

SQLite access rules: read-only URI mode; map `estimated_charge_micro_usd` -> display as `$X.XXXX`; `created_at` is RFC3339 with offset — parse to epoch for range filters.

## Must not
- No secrets in repo or UI code. Never log/display API key VALUES (env keys or created keys — created key shown once in the copy box, not persisted to any log).
- No binary, no DB dumps, no logs in git (keep ui/ source-only; .gitignore already covers *.orig, *.db, *.log).
- No editing of proot rootfs layout, no changes to daemon config paths, no killing processes by hand.
- No npm/native builds on Termux; no node_modules committed.
- Don't implement OTel/traces or ACP agent management pages in v1 — note as "later" in README only.

## Delivery
- All files under ~/zesrouter/ui/ (or ui/ subtree of the repo). README-ui.md one-pager: run instructions (`python3 ui/server.py`, open http://localhost:8080), page map, API table.
- Self-check before done: run server, curl each /api endpoint, confirm non-zero JSON + sane values from the live daemon; screenshot-shoot each page; list any endpoint that returned empty because the underlying CLI/DB is empty (e.g. api_keys may be 0 rows — UI must render empty states gracefully).