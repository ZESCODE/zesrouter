# ZESRouter — Overview

Welcome to ZESRouter, the BitRouter‑based inference router running inside `proot-distro Debian` on the phone.

**Primary endpoint**: `http://127.0.0.1:5051/v1` (ZESRouter daemon)  
**Failover / OmniRoute**: `http://127.0.0.1:20128/v1` (9Router)  
**Relay ports**: Zen `:7077`, NVIDIA `:9456`, Pollinations `:7079`, AI Horde `:8078`  
**Dashboard**: `http://127.0.0.1:8080` (Frost Control Panel)

---

## Topology Overview

See the full topology diagram and component map:

- [Topology & Vertical Schematic](/zesrouter/docs/topo/overview.md) — vertical data‑flow diagram, component map, and typical request flow.

---

## Quick Start

```bash
# Start all services
bash ~/zesrouter/bin/zesrouter-start start

# Verify live catalog
curl -s http://127.0.0.1:5051/v1/models | jq -r '.data[].id' | sort

# Via bridge (NVIDIA)
curl -s http://127.0.0.1:5051/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"nvidia:nvidia/z-ai/glm-5.2","messages":[{"role":"user","content":"hi"}],"max_tokens":20}'

# Via zen relay (free)
curl -s http://127.0.0.1:5051/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"opencode:muse-spark-1.2-contributor-free","messages":[{"role":"user","content":"hi"}]}'

# Agent config (fallback)
# ~/.codex/config.toml
# model = "opencode/muse-spark-1.2-contributor-free"
# model_provider = "zesrouter"
```

---

## Documentation Map

| Section | Description |
|---|---|
| [Providers](/zesrouter/docs/providers/) | Full model catalog (36 models, 8 providers) |
| [Topology](/zesrouter/docs/topo/) | Architecture diagram, vertical schematic, port map |
| [Bridges & Relays](/zesrouter/docs/providers/zesrouter.md#bridges--relays) | Zen, NVIDIA, 9Router, Pollinations, AI Horde |
| [Usage](/zesrouter/docs/providers/zesrouter.md#usage) | Verify catalog, agent config, pinned form |
| [Troubleshooting](/zesrouter/docs/providers/zesrouter.md#troubleshooting) | 503 upstream, 504 timeout, pgrep pitfalls |
| [Update History](/zesrouter/docs/providers/zesrouter.md#update-history) | 2026‑08‑21 free‑model audit, deepseek→muse‑spark |

---

## License

MIT — see `LICENSE` in the repo root.