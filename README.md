# ZESRouter

ZES-branded packaging of [BitRouter](https://github.com/bitrouter/bitrouter) — the self-improving LLM router. Tuned for the ZES stack: multi-provider failover (opencode-zen, openai, anthropic, openrouter, github-copilot, pollinations) behind one local endpoint `http://localhost:4356/v1`, with policy-tier routing (cheap/flagship), workflow fingerprints, and OTel observability.

Rebranded packaging only — binary is upstream BitRouter v1.0.0-alpha.27 (Apache-2.0). Config is tuned for ZES-System.

## Provenance

| Part | Origin | License |
|------|--------|---------|
| Binary (`bitrouter.orig`) | [bitrouter/bitrouter](https://github.com/bitrouter/bitrouter) v1.0.0-alpha.27, aarch64-unknown-linux-gnu | Apache-2.0 |
| `configs/bitrouter.yaml` | Derived from ZES production config | Apache-2.0 |
| `bin/` wrapper scripts | ZES (this repo) | MIT |

## Quick Start (Termux + proot-distro Debian)

```bash
# 1. Fetch + byte-verify binary
bash bin/fetch-binary.sh

# 2. Install config inside proot
proot-distro login debian -- mkdir -p /root/.bitrouter
proot-distro login debian -- cp /data/data/com.termux/files/home/zesrouter/configs/bitrouter.yaml /root/.bitrouter/bitrouter.yaml

# 3. Launch
bin/zesrouter-start
```

API keys come from `~/.secure-credentials/master.env` (OPENCODE_ZEN_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY) — not stored in this repo.

## Restore from this repo (fresh proot)

```bash
bash bin/fetch-binary.sh
proot-distro login debian -- mkdir -p /root/.bitrouter /tmp/br-init
proot-distro login debian -- cp /data/data/com.termux/files/home/zesrouter/configs/bitrouter.yaml /root/.bitrouter/bitrouter.yaml
proot-distro login debian -- cp /data/data/com.termux/files/home/zesrouter/configs/br-init/bitrouter.yaml /tmp/br-init/bitrouter.yaml
bin/zesrouter-start
```

## Binary verification

Pinned sha256: `e72611fb2adfb2be614b7357d7c11526230f28b47840ea66e8268d15717ec581`

`bin/fetch-binary.sh` downloads the pinned release asset, verifies its sha256, and verifies the installed file byte-for-byte. Any upstream rebuild breaks the match deliberately — never trust an unverified binary.

## Features

- OpenAI + Anthropic-compatible API on :4356 — any SDK works unchanged
- Cross-protocol routing: OpenAI Chat Completions/Responses, Anthropic Messages, Gemini
- Multi-provider failover chains (per-model endpoint lists)
- Policy tiers (cheap/flagship) + workflow fingerprints (after_terminal=cheap, after_tool_error=flagship)
- Adequacy self-improvement — observes agent loops, publishes policy-lock.yaml
- Virtual keys, budgets, rate limits, guardrails
- ACP orchestration: launch/spawn claude, codex, opencode, pi, hermes, grok
- MCP gateway (web_search/web_fetch via Tavily/Exa/Firecrawl)
- OTel observability (traces + metrics), SQLite route history, hot-reload

## CLI

```bash
bin/zesrouter --help          # full CLI (serve/start/stop/reload/status/route/init/key/models/tools/observe/policy/providers/agents/launch/spawn/tui/update)
bin/zesrouter status
bin/zesrouter route deepseek/deepseek-v4-flash-free
```

## Notes

- Telemetry is opt-in (BITROUTER_TELEMETRY_TOKEN unset locally = nothing phones home)
- Cloud features (bitrouter.ai SaaS: BYOK, namespaces, billing) require upstream account — local routing is standalone
- Config backups kept alongside live config in proot (`bitrouter.yaml.bak-*`)

## License

- Wrapper scripts: MIT (this repo)
- Binary, configs, upstream code: Apache-2.0 — see [bitrouter/bitrouter](https://github.com/bitrouter/bitrouter)
