# ZESRouter Dashboard — rproxy on :5050

**rproxy** (`rproxy-5050.mjs`) — Node.js HTTP reverse proxy listening on `0.0.0.0:5050`.  
Primary entry point for external clients; routes based on URL path.

---

## Architecture

```mermaid
flowchart TB
    subgraph Client [External Client]
        direction TB
        C1[CLI / Codex / Browser]
        C2[curl / httpie]
    end

    subgraph Rproxy [rproxy :5050]
        direction TB
        R1[Node.js HTTP Server]
        R2[Path Router]
        R3[/v1/* → BitRouter :5051]
        R4[Other → Frost :8090]
    end

    subgraph Upstream [Upstreams]
        direction TB
        U1[BitRouter :5051 → policy + relays]
        U2[Frost Dashboard :8090 → UI + keys]
    end

    C1 -->|HTTP| R1
    C2 -->|HTTP| R1

    R1 --> R2
    R2 -->|path starts with /v1| U1
    R2 -->|otherwise| U2
```

---

## Path Routing Logic

| Request Path | Target | Upstream |
|---|---|---|
| `/v1/models` | `127.0.0.1:5051` | BitRouter (54 models) |
| `/v1/chat/completions` | `127.0.0.1:5051` | BitRouter (chat completions) |
| `/v1/*` | `127.0.0.1:5051` | BitRouter (all `/v1` routes) |
| `/` / `/health` / other | `127.0.0.1:8090` | Frost Dashboard |
| `GET /api/providers/*` | `127.0.0.1:8090` | Frost provider APIs |
| `POST /api/providers/key` | `127.0.0.1:8090` | Frost key management |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LISTEN_PORT` | `5050` | Port to bind rproxy to |
| `API_TARGET` | `127.0.0.1:5051` | BitRouter target (upstream for `/v1/*`) |
| `DASH_TARGET` | `127.0.0.1:8090` | Frost dashboard target (rest) |

---

## Quick Verification

```bash
# Models via rproxy (→ BitRouter :5051)
curl -s http://127.0.0.1:5050/v1/models | jq -r '.data[].id' | sort

# Chat completions via rproxy (→ BitRouter :5051)
curl -s --max-time 30 http://127.0.0.1:5050/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"opencode/muse-spark-1.2-contributor-free","messages":[{"role":"user","content":"hi"}],"max_tokens":20}' | head -c 300

# Frost dashboard (non-/v1 paths)
curl -s http://127.0.0.1:5050/health

# Direct BitRouter (bypass rproxy)
curl -s http://127.0.0.1:5051/v1/models
```

---

## Related Docs

- [ZESRouter Overview](/zesrouter/docs/overview.md) — full system overview
- [Topology Schematic](/zesrouter/docs/topo/overview.md) — vertical data-flow diagram
- [Providers Catalog](/zesrouter/docs/providers/) — 36 models, 8 providers
- [BitRouter Config](/zesrouter/configs/bitrouter.yaml) — policy table, provider mapping
- [Frost Dashboard](/data/data/com.termux/files/home/logs) — `:8090` UI + provider keys