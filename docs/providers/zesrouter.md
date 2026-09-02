# ZESRouter — Full Provider & Model Catalog (Updated 2026-08-21)

---
date: 2026-08-21
authors: OpenCode (muse-spark-1.2-contributor-free), Hermes
version: 2.0
status: active
ports: [4356, 7077, 9456, 8080]
config: `~/zesrouter/configs/bitrouter.yaml:1`
change_id: zesrouter-provider-catalog-2026-08-21
related:
  - docs/providers/bitrouter.md
  - docs/services/ports.md
  - docs/infrastructure/overview.md
  - ~/zesrouter/relay/zen_relay.py:1
  - ~/zesrouter/relay/nvidia_bridge.py:1
  - ~/zesrouter/bin/zesrouter-start
---

## Overview

**ZESRouter** is the BitRouter reinstall (2026-08-21) running inside `proot-distro Debian` on the phone as the **fallback router**. **OmniRoute `:20128` is primary**; ZESRouter `:4356` serves when primary is down.

- **Listen:** `0.0.0.0:4356`, `skip_auth: true` (`~/zesrouter/configs/bitrouter.yaml:1`)
- **Process:** `bitrouter.orig serve` inside proot, managed by `~/zesrouter/bin/zesrouter-start`
- **Dashboard:** Frost Control Panel on `:8080` (`~/zesrouter/ui/server.py`)
- **Failover:** `codex -c model_provider=zesrouter`, `agy --agent zesrouter-opencode-zen`, Hermes `fallback_providers`, wrapper `~/.local/bin/zai`

### Service Map

| Component | Port | Upstream | Purpose | Key |
|-----------|------|----------|---------|-----|
| **ZESRouter daemon** | `4356` | — | OpenAI-compatible `/v1` routing | — |
| **Zen relay** | `7077` | `https://opencode.ai/zen/v1` | Opencode free pool (keyless) | `Bearer public` (`~/zesrouter/relay/zen_relay.py:11`) |
| **NVIDIA bridge** | `9456` | `https://integrate.api.nvidia.com/v1` | NVIDIA Build free pool | `NVIDIA_API_KEY` (`~/zesrouter/relay/nvidia_bridge.py:1`) |
| **Dashboard** | `8080` | — | Frost UI + provider keys + logs | — |

```
client → :4356 (ZESRouter) → policy_table → provider → service_id
          ├─ opencode-zen-relay → :7077 → https://opencode.ai/zen/v1 (free)
          ├─ nvidia → :9456 → https://integrate.api.nvidia.com/v1 (20 models)
          ├─ pollinations → https://gen.pollinations.ai/v1 (4 models)
          └─ openrouter → https://openrouter.ai/api/v1 (2 free)
```

---

## Providers (8)

| ID | Display Name | Class | `api_base` | Auth | Env | Enabled | Models |
|----|--------------|-------|------------|------|-----|---------|--------|
| `opencode-zen` | — | — | — | — | `OPENCODE_ZEN_API_KEY` (empty, keyless) | `true` | — |
| `openai` | — | — | — | — | `OPENAI_API_KEY` | `true` | — |
| `anthropic` | — | — | — | — | `ANTHROPIC_API_KEY` | `true` | — |
| `openrouter` | — | `third-party-api` | `https://openrouter.ai/api/v1` | `bearer` (`~/zesrouter/configs/bitrouter.yaml:14`) | `OPENROUTER_API_KEY` (`~/zesrouter/ui/server.py:154`) | `true` | 2 |
| `github-copilot` | — | — | — | — | `GITHUB_PAT_ZESXDEV` (`~/zesrouter/ui/server.py:151`) | `true` | — |
| `pollinations` | Pollinations (no key) | `third-party-api` | `https://gen.pollinations.ai/v1` (`~/zesrouter/configs/bitrouter.yaml:23`) | none (keyless) | `none` | `true` | 4 |
| `opencode-zen-relay` | OpenCode Zen (keyless relay) | `third-party-api` | `http://127.0.0.1:7077/v1` (`~/zesrouter/configs/bitrouter.yaml:31`) | none | `none` (`~/zesrouter/ui/server.py:288`) | `true` | 7–14* |
| `nvidia` | NVIDIA Build (nvapi) | `third-party-api` | `http://127.0.0.1:9456/v1` (`~/zesrouter/configs/bitrouter.yaml:39`) | `bearer` (`~/zesrouter/configs/bitrouter.yaml:41`) | `NVIDIA_API_KEY` (`~/.secure-credentials/master.env`) | `true` | 20 |

> **Keyless providers** are defined in `~/zesrouter/ui/server.py:288` as `KEYLESS_PROVIDERS = ("pollinations", "opencode-zen-relay")`. Env var resolution: `config auth.env > DEFAULT_ENV > <PID>_API_KEY` (`~/zesrouter/ui/server.py:163`). Keys stored only in `~/.secure-credentials/master.env` (chmod 600), never echoed (`~/zesrouter/ui/server.py:172`). NVIDIA bridge auto-restarts on key change (`~/zesrouter/ui/server.py:226`).

---

## Live Model Catalog — 36 Models (`curl http://127.0.0.1:4356/v1/models`)

> Sorted by `id`. `provider` + `service_id` are the routing entries in `~/zesrouter/configs/bitrouter.yaml:68`.

### By Provider

#### `opencode` via `opencode-zen-relay` (7 live, 8 in config*)

| ZESRouter ID | `provider` | `service_id` | Zen Upstream ID | Status | Context | Notes |
|--------------|------------|--------------|-----------------|--------|---------|-------|
| `opencode/muse-spark-1.2-contributor-free` | `opencode-zen-relay` | `muse-spark-1.2-contributor-free` | `muse-spark-1.2-contributor-free` | **active** | 1,048,576 | **Current flagship free** (replaces deprecated `deepseek-v4-flash-free`), released 2026-08-05. Coding focus, `reasoning` + `tool_call` + multimodal (text/image/video/pdf/audio). |
| `opencode/hy3-free` | `opencode-zen-relay` | `hy3-free` | `hy3-free` | active | 190,000 | |
| `opencode/mimo-v2.5-free` | `opencode-zen-relay` | `mimo-v2.5-free` | `mimo-v2.5-free` | active | 200,000 | |
| `opencode/nemotron-3-ultra-free` | `opencode-zen-relay` | `nemotron-3-ultra-free` | `nemotron-3-ultra-free` | active | 1,000,000 | |
| `opencode/nemotron-3.5-lightning-free` | `opencode-zen-relay` | `nemotron-3.5-lightning-free` | `nemotron-3.5-lightning-free` | active | 262,144 | |
| `opencode/laguna-s-2.1-free` | `opencode-zen-relay` | `laguna-s-2.1-free` | `laguna-s-2.1-free` | active* | 256,000 | **In ZESRouter but no longer in CLI curated list** (`opencode models opencode` hides it). Still served via zen API. |
| `opencode/deepseek-v4-flash-free` | `opencode-zen-relay` | `deepseek-v4-flash-free` | `deepseek-v4-flash-free` | **deprecated** | 200,000 | **`status: deprecated` in `~/.cache/opencode/models.json:deepseek-v4-flash-free`**. CLI `opencode models opencode` **no longer lists it** (7-model curated list). Still routed via `deepseek/deepseek-v4-flash-free` aliases for compatibility, but migrate to `muse-spark-1.2-contributor-free`. |
| *Not yet in ZESRouter (available upstream)* | — | — | `opencode/big-pickle` | active | 200,000 | **New free model** (CLI `opencode/big-pickle`, `~/.cache/opencode/models.json:big-pickle`). Not yet routed in `bitrouter.yaml`. Add as `opencode/big-pickle → opencode-zen-relay:big-pickle`. |
| *Not yet in ZESRouter (available upstream)* | — | — | `opencode/muse-spark-1.2-contributor-free` | active | 1,048,576 | **Current flagship free** (replaces `x-preview-f-free`), released 2026-08-05. 1M context, multimodal, `reasoning` + `tool_call`. Already routed in `bitrouter.yaml:111`. |

**Config entries in `~/zesrouter/configs/bitrouter.yaml:68`:**
```yaml
opencode/muse-spark-1.2-contributor-free: { provider: opencode-zen-relay, service_id: muse-spark-1.2-contributor-free } #111
opencode/hy3-free, mimo-v2.5-free, nemotron-3-ultra-free, nemotron-3.5-lightning-free, laguna-s-2.1-free, deepseek-v4-flash-free
```

**Aliases still pointing to deprecated `deepseek-v4-flash-free`:**
```yaml
anthropic/claude-sonnet-5:             #69
  - provider: opencode-zen-relay, service_id: deepseek-v4-flash-free
  - provider: pollinations, service_id: deepseek
deepseek/deepseek-v4-flash:            #75
deepseek/deepseek-v4-flash-free:       #81
```

> **Action:** update `policy_table.tiers.cheap` (`~/zesrouter/configs/bitrouter.yaml:222`) and the 3 alias `service_id` above to `muse-spark-1.2-contributor-free` (or `big-pickle`) to avoid deprecated model.

#### `deepseek` aliases (2)

| ID | Provider | `service_id` |
|----|----------|--------------|
| `deepseek/deepseek-v4-flash` | `opencode-zen-relay` / `pollinations` | `deepseek-v4-flash-free` / `deepseek` |
| `deepseek/deepseek-v4-flash-free` | same | same |

#### `anthropic` alias (1)

| ID | Provider | `service_id` |
|----|----------|--------------|
| `anthropic/claude-sonnet-5` | `opencode-zen-relay` / `pollinations` | `muse-spark-1.2-contributor-free` / `deepseek` |

#### `pollinations` (4)

| ID | `service_id` | Upstream |
|----|--------------|----------|
| `pollinations/qwen-coder` | `qwen-coder` | `https://gen.pollinations.ai/v1` |
| `pollinations/openai-fast` | `openai-fast` | same |
| `pollinations/openai` | `openai` | same |
| `pollinations/qwen-vision` | `qwen-vision` | same |

Class: `third-party-api`, keyless. Pollinations is the **pollinations free pool** used as second fallback in `anthropic/claude-sonnet-5` aliases.

#### `openrouter` (2, `:free` suffix)

| ID | `service_id` | Notes |
|----|--------------|-------|
| `openrouter/google/gemma-4-31b-it:free` | `google/gemma-4-31b-it:free` | Free tier, requires `OPENROUTER_API_KEY` (currently empty in `master.env`) |
| `openrouter/nvidia/nemotron-nano-12b-v2-vl:free` | `nvidia/nemotron-nano-12b-v2-vl:free` | same |

#### `nvidia` via bridge (20)

| ZESRouter ID | `provider_model_id` (bridge → `integrate.api.nvidia.com/v1`) | Notes |
|--------------|--------------------------------------------------------------|-------|
| `nvidia/z-ai/glm-5.2` | `z-ai/glm-5.2` | **Verified 200 OK via `:4356` pinned `nvidia:nvidia/z-ai/glm-5.2`** |
| `nvidia/google/gemma-4-31b-it` | `google/gemma-4-31b-it` | Verified streaming SSE 200 |
| `nvidia/openai/gpt-oss-20b` | `openai/gpt-oss-20b` | |
| `nvidia/nvidia/nemotron-3-super-120b-a12b` | `nvidia/nemotron-3-super-120b-a12b` | |
| `nvidia/nvidia/nemotron-3-ultra-550b-a55b` | `nvidia/nemotron-3-ultra-550b-a55b` | Verified 200 |
| `nvidia/meta/llama-3.1-8b-instruct` | `meta/llama-3.1-8b-instruct` | |
| `nvidia/meta/llama-3.2-11b-vision-instruct` | `meta/llama-3.2-11b-vision-instruct` | |
| `nvidia/mistralai/mistral-nemotron` | `mistralai/mistral-nemotron` | |
| `nvidia/nvidia/llama-3.1-nemoguard-8b-content-safety` | `nvidia/llama-3.1-nemoguard-8b-content-safety` | |
| `nvidia/nvidia/llama-3.1-nemoguard-8b-topic-control` | `nvidia/llama-3.1-nemoguard-8b-topic-control` | |
| `nvidia/nvidia/llama-3.1-nemotron-nano-vl-8b-v1` | `nvidia/llama-3.1-nemotron-nano-vl-8b-v1` | |
| `nvidia/nvidia/llama-3.1-nemotron-safety-guard-8b-v3` | `nvidia/llama-3.1-nemotron-safety-guard-8b-v3` | |
| `nvidia/nvidia/llama-3.3-nemotron-super-49b-v1` | `nvidia/llama-3.3-nemotron-super-49b-v1` | |
| `nvidia/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | |
| `nvidia/nvidia/nemotron-3.5-content-safety` | `nvidia/nemotron-3.5-content-safety` | |
| `nvidia/nvidia/nemotron-3-nano-30b-a3b` | `nvidia/nemotron-3-nano-30b-a3b` | |
| `nvidia/nvidia/nemotron-mini-4b-instruct` | `nvidia/nemotron-mini-4b-instruct` | |
| `nvidia/nvidia/nemotron-nano-12b-v2-vl` | `nvidia/nemotron-nano-12b-v2-vl` | |
| `nvidia/deepseek-ai/deepseek-v4-flash-0731` | `deepseek-ai/deepseek-v4-flash-0731` | `504 upstream_timeout` after 120s daemon cap (free-tier queue) |
| `nvidia/minimaxai/minimax-m3` | `minimaxai/minimax-m3` | |

> **NVIDIA details:** `api_base http://127.0.0.1:9456/v1` (`~/zesrouter/configs/bitrouter.yaml:39`) → bridge `~/zesrouter/relay/nvidia_bridge.py:1` forwards to `https://integrate.api.nvidia.com/v1` with `Authorization: Bearer $NVIDIA_API_KEY` + `User-Agent: curl/8.21.0`, `urllib` timeout 300s, SSE streaming. Daemon upstream timeout 120s. Rate ~40 req/min, no daily limit, always available. Key in `~/.secure-credentials/master.env:NVIDIA_API_KEY` (`nvapi-Sa0K...`). Bridge wire: `~/zesrouter/bin/zesrouter-start` does `curl -s 127.0.0.1:9456/health || setsid -f env NVIDIA_API_KEY=... python3 ~/zesrouter/relay/nvidia_bridge.py`.

**Total live:** `36` (`curl -s http://127.0.0.1:4356/v1/models | jq .data[].id`).

---

## OpenCode Free CLI Update — 2026-08-21

### What changed

| Before (deprecated) | After (current) | Source |
|---------------------|-----------------|--------|
| `opencode/deepseek-v4-flash-free` | **removed from CLI curated list** | `opencode models opencode` now lists 7, not 8; `~/.cache/opencode/models.json:deepseek-v4-flash-free` has `"status": "deprecated"` |
| — | `opencode/muse-spark-1.2-contributor-free` | Replacement flagship free, released 2026-08-05, 1M context, multimodal, `cost:0`. **This session's agent model** (`opencode/muse-spark-1.2-contributor-free`). |
| — | `opencode/big-pickle` | **New** free, 200k context, `cost:0`, not yet in `bitrouter.yaml`. `opencode models opencode` lists it. |
| `opencode/x-preview-f-free` existed upstream but CLI now advertises it | `opencode/x-preview-f-free` (Ox Alpha Free) | **New** free, released 2026-08-21, 1M context, active. Already in `~/.cache/opencode/models.json:x-preview-f-free`, now in CLI 7-list. |

**CLI curated free (7) vs. `models.json` free (29):**

- `opencode models opencode` (curated, what `opencode --help` users see):
  ```
  opencode/big-pickle
  opencode/hy3-free
  opencode/mimo-v2.5-free
  opencode/muse-spark-1.2-contributor-free
  opencode/nemotron-3-ultra-free
  opencode/nemotron-3.5-lightning-free
  opencode/x-preview-f-free
  ```

- `~/.cache/opencode/models.json:opencode` `cost.input==0` (29 free, incl. `laguna-s-2.1-free`, `kimi-k2.5-free`, `ling-*`, `glm-*`, etc.) — still served by `https://opencode.ai/zen/v1` but **not advertised** by CLI. `opencode models --verbose` only shows the 7.

- Live zen API `GET https://opencode.ai/zen/v1/models` (`Authorization: Bearer public`) still returns `deepseek-v4-flash-free` (deprecated but reachable) plus 7 `*-free` + `big-pickle` (via `big-pickle` id without `-free`). Zen relay (`~/zesrouter/relay/zen_relay.py:22`) filters `mid.endswith("-free") or "free" in mid` and adds `EXTRA_MODELS` hardcode (includes `deepseek-v4-flash-free`, `kimi-k2.5-free`), so relay still serves deprecated `deepseek-v4-flash-free` even though CLI hides it.

### Why `muse-spark-1.2`

- `muse-spark-1.2-contributor-free` (`~/.cache/opencode/models.json:muse-spark-1.2-contributor-free`) is **Muse Spark 1.2** (coding-focused update to 1.1), 1,048,576 context, 131,072 output, `reasoning` + `tool_call` + multimodal, released 2026-08-05. It is the intended replacement for `deepseek-v4-flash-free` (deprecated 2026-07-31 release). ZESRouter already routes it (`~/zesrouter/configs/bitrouter.yaml:111`), but `policy_table.tiers.cheap` still points to the deprecated `deepseek`.

### Recommended config patch

```diff
# ~/zesrouter/configs/bitrouter.yaml
-  tiers: { cheap: deepseek/deepseek-v4-flash-free, flagship: anthropic/claude-sonnet-5 }
+  tiers: { cheap: opencode/muse-spark-1.2-contributor-free, flagship: anthropic/claude-sonnet-5 }

- opencode/deepseek-v4-flash-free: { service_id: deepseek-v4-flash-free }
+ opencode/muse-spark-1.2-contributor-free: { service_id: muse-spark-1.2-contributor-free } # already exists
+ opencode/big-pickle: { provider: opencode-zen-relay, service_id: big-pickle }
+ laguna-s-2.1-free: keep or remove (CLI no longer advertises, but zen still serves)
```

And in `~/zesrouter/relay/zen_relay.py:13` update `EXTRA_MODELS` to remove `deepseek-v4-flash-free` / `kimi-k2.5-free` and add `big-pickle`:

```python
EXTRA_MODELS = [
    {"id": "opencode/muse-spark-1.2-contributor-free", ...},
    {"id": "opencode/big-pickle", ...},
]
```

---

## Policy Table

```yaml
# ~/zesrouter/configs/bitrouter.yaml:220
policy_table:
  tiers:
    cheap: opencode/muse-spark-1.2-contributor-free       # updated from deprecated deepseek
    flagship: anthropic/claude-sonnet-5
  fingerprints:
    opening: flagship
    after_read_file: cheap
    after_write_file: cheap
    after_search_files: cheap
    after_terminal: cheap
    midstream: cheap
    after_tool_error: flagship
    after_delegate_task: cheap
  default_tier: flagship
  tool_use_tier: flagship
  tool_safe_tiers: [flagship]
  adequacy: { enabled: true, escalation_tier: flagship }
```

**Bypass:** `provider:model` colon form skips policy via `is_explicitly_routed()` (checks `":" in model` or `model.startswith("@")`) in `policy_table_router.rs:156` (`tiers.is_empty() → return None` also inert). Use pinned form to force a provider: `"model":"nvidia:nvidia/z-ai/glm-5.2"` or `"model":"opencode:muse-spark-1.2-contributor-free"`.

---

## Bridges & Relays

### Zen relay (`~/zesrouter/relay/zen_relay.py:1`)

- **Port** `7077` (`ZEN_RELAY_PORT`), `ThreadingHTTPServer("127.0.0.1", 7077)`
- **Upstream** `https://opencode.ai/zen/v1` (`ZEN_BASE`), `UA = "opencode/1.15.0 ... runtime/bun/1.3.13"`
- **Auth** `Authorization: Bearer public` + `x-opencode-*` headers with fresh `ses_ + uuid` per request (`zen_headers()`)
- **Models** `fetch_models()` filters `*-free` + `EXTRA_MODELS`; cache 300s
- **Chat** `POST /v1/chat/completions` rewrites `model` to last segment (`opencode/muse-spark-... → muse-spark-...`), forwards `stream`, strips error events via `strip_stream_events()`

### NVIDIA bridge (`~/zesrouter/relay/nvidia_bridge.py:1`)

- **Port** `9456`, `integrate.api.nvidia.com/v1`
- **Fix** for daemon direct 503 `upstream unavailable` (UA-less reqwest rejected). Bridge adds `curl/8.21.0` UA, 300s urllib timeout, SSE passthrough.
- **Key** `NVIDIA_API_KEY` from `master.env` at start (`setsid -f env NVIDIA_API_KEY=... python3 ...`). Restart on key change via `~/zesrouter/ui/server.py:226` `restart_bridge()`.

### Auto-start (`~/zesrouter/bin/zesrouter-start`)

- Copies `~/zesrouter/configs/bitrouter.yaml → /root/.bitrouter/bitrouter.yaml` inside proot, then:
  ```bash
  curl -s http://127.0.0.1:9456/health || setsid -f env NVIDIA_API_KEY="$NVIDIA_API_KEY" python3 ~/zesrouter/relay/nvidia_bridge.py
  curl -s http://127.0.0.1:7077/health || setsid -f python3 ~/zesrouter/relay/zen_relay.py
  ```
- Must use `setsid -f ... </dev/null >log 2>&1` (bash-tool sessions kill children otherwise). Verify by **port/curl**, not `pgrep -f` (self-matches wrapper).

---

## Key Management & Dashboard

- **Dashboard** `http://127.0.0.1:8080` Frost Control Panel (`~/zesrouter/ui/server.py`).
- **Providers API** `POST /api/providers/key` (`~/zesrouter/ui/server.py:172`) — set/clear key in `master.env`, chmod 600, never echoes, auto-restarts NVIDIA bridge if `nvidia`.
- **Other APIs:** `GET /api/providers`, `POST /api/providers/test` (end-to-end tiny completion via daemon on provider's first model, `~/zesrouter/ui/server.py:483`), `GET /api/stats/costs`, `GET /api/logs`, `POST /api/daemon` (`restart`/`reload`).
- **`DEFAULT_ENV`** (`~/zesrouter/ui/server.py:147`): `opencode-zen: OPENCODE_ZEN_API_KEY`, `openai: OPENAI_API_KEY`, `anthropic: ANTHROPIC_API_KEY`, `github-copilot: GITHUB_PAT_ZESXDEV`, `nvidia: NVIDIA_API_KEY`, `openrouter: OPENROUTER_API_KEY`, `groq: GROQ_API_KEY`, `deepseek: DEEPSEEK_API_KEY`. `KEYLESS_PROVIDERS` are `pollinations`, `opencode-zen-relay`.

**GH keys:** `GITHUB_PAT_ZESXDEV` (ZESCODE, 2nd phone) for ZESRouter vs `arfaxdev` for OmniRoute — both in `master.env`, never in docs (`docs/providers/k.txt.txt` redacted 2026-08-19).

---

## Usage

### Verify live catalog

```bash
curl -s http://127.0.0.1:4356/v1/models | jq -r '.data[].id' | sort
# 36 total

# Via bridge (NVIDIA)
curl -s http://127.0.0.1:4356/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"nvidia:nvidia/z-ai/glm-5.2","messages":[{"role":"user","content":"hi"}],"max_tokens":20}'

# Via zen relay (free)
curl -s http://127.0.0.1:4356/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"opencode:muse-spark-1.2-contributor-free","messages":[{"role":"user","content":"hi"}]}'

# Direct relay check
curl -s http://127.0.0.1:7077/v1/models | jq .
curl -s https://opencode.ai/zen/v1/models -H "Authorization: Bearer public" | jq .
opencode models opencode --verbose | head
```

### Agent config (fallback)

```toml
# ~/.codex/config.toml
model = "opencode/muse-spark-1.2-contributor-free"
model_provider = "zesrouter"

[model_providers.zesrouter]
name = "ZESRouter (fallback)"
base_url = "http://127.0.0.1:4356/v1"
wire_api = "chat"
```

> **Pinned form** required to bypass policy hijack when you need a specific provider. `nvidia:nvidia/...` and `opencode:...` are explicit routes (`":"` in name).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `503 upstream unavailable` to NVIDIA | Direct daemon UA-less request rejected (TCP+TLS ok, app 503) | Use bridge `:9456` (api_base `http://127.0.0.1:9456/v1`), verify `curl -s http://127.0.0.1:9456/v1/chat/completions` 200 |
| `504 upstream_timeout` (deepseek 0731) | Free-tier queue slow, daemon hard 120s cap | Retry later, or use `glm-5.2`/`nemotron` |
| `000` from `:4356` | Daemon down (proot not started) | `bash ~/zesrouter/bin/zesrouter-start` (with `setsid -f` for bridges) |
| Relay `000` | Bridge died with shell | `setsid -f env NVIDIA_API_KEY=... python3 ~/zesrouter/relay/nvidia_bridge.py </dev/null >/tmp/nvidia.log 2>&1` then `curl -s http://127.0.0.1:9456/health` |
| Bottom nav covers buttons (`:8080`) | `100vh` vs `100dvh` + safe-area | Fixed 2026-08-21: `100dvh` + `pb-[env(safe-area-inset-bottom)]` in `~/zesrouter/ui/src/components/Layout.tsx` |
| `pgrep` shows bridge but port 000 | `pgrep -f` self-matches wrapper | Verify by `curl`, not `pgrep` |

---

## Update History

- **2026-08-21 (this doc):** Full catalog audit — 36 live models. **Opencode free update:** `deepseek-v4-flash-free` deprecated (`models.json:status deprecated`, removed from `opencode models opencode` curated 7-list), replaced by `muse-spark-1.2-contributor-free` (1M context, 2026-08-05) + new `big-pickle` (200k) & `x-preview-f-free` (1M, 2026-08-21). Added NVIDIA bridge (20 models) + Frost dashboard provider-key APIs. Documents `192.168.1.x:4356` → `127.0.0.1:4356` inside phone, `:7077` zen relay, `:9456` NVIDIA bridge, `:8080` dashboard. Recommends patching `policy_table.tiers.cheap` and alias `service_id` from deprecated `deepseek-v4-flash-free` to `muse-spark-1.2-contributor-free`, and adding `big-pickle`/`x-preview-f-free` to `bitrouter.yaml` + `zen_relay.py EXTRA_MODELS`.

- **2026-08-21:** BitRouter reinstalled as ZESRouter `:4356` fallback (opencode-zen, pollinations, nvidia); OmniRoute `:20128` primary; failover wired into `codex`/`agy`/`hermes` + `zai` wrapper.

- **2026-08-16:** BitRouter uninstalled — 9Router handled control + data plane.

- **2026-08-11:** Laptop switched to OmniRoute public API as primary inference.
