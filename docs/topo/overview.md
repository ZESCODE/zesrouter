# ZESRouter — Topology Overview

**Diagram generated**: 2026-09-02  
**Architecture**: BitRouter (:5051) + Relays (:7077, :9456) + 9Router (:20128)  
**Primary endpoint**: `http://127.0.0.1:5051/v1` (ZESRouter daemon)  
**Failover**: OmniRoute `:20128` (9Router)  

---

## Vertical Schematic — Data Flow Downward

```mermaid
flowchart TB
    %% Client layer
    subgraph Client [Client / Code / CLI]
        direction TB
        C1[CLI: `opencode --model opencode/muse-spark-1.2-contributor-free`]
        C2[Codex: `model_provider = zesrouter`]
        C3[Agents: agy / hermes / Hermes]
    end

    %% ZESRouter daemon (port 5051)
    subgraph ZESRouter [ZESRouter Daemon :5051]
        direction TB
        D1[BitRouter SDK]
        D2[Policy Table Router]
        D3[Tiers: cheap → muse-spark-1.2-contributor-free]
        D4[flagship → anthropic/claude-sonnet-5]
        D5[tool_safe_tiers: [flagship]]
        D6[Adequacy Check]
        D7[Plugin: bitrouter-observe (OTel)]
    end

    %% Provider relays (downstream)
    subgraph Relays [Relays Downstream]
        direction TB
        R1[Zen Relay :7077 → opencode.ai/zen/v1]
        R2[NVIDIA Bridge :9456 → integrate.api.nvidia.com/v1]
        R3[9Router :20128 → local LLM pool]
        R4[Pollinations :7079 → gen.pollinations.ai/v1]
        R5[AI Horde :8078 → anonymous pool]
    end

    %% Policy & routing
    D2 -- routes by fingerprint --> D3
    D2 -- routes by model::provider --> D6
    D2 -- explicit `:model` form --> D1

    %% Downstream provider calls
    D1 -- HTTP :7077 --> R1
    D1 -- HTTP :9456 --> R2
    D1 -- HTTP :20128 --> R3
    D1 -- HTTP :7079 --> R4
    D1 -- HTTP :8078 --> R5

    %% Client → ZESRouter
    C1 -->|POST /v1/chat/completions| D1
    C2 -->|POST /v1/chat/completions| D1
    C3 -->|POST /v1/chat/completions| D1

    %% Zen relay (free models)
    R1 -- GET /models --> ZEN_API
    R1 -- POST /chat/completions --> ZEN_API

    %% NVIDIA bridge (20 models)
    R2 -- key: NVIDIA_API_KEY --> NVIDIA API

    %% 9Router (OmniRoute primary)
    R3 -- models: auto-zes, auto-best, auto-vision --> local pool

    %% Pollinations (4 keyless models)
    R4 -- no key --> pollinations free pool

    %% AI Horde (anon)
    R5 -- anon key --> aihorde pool

    %% Model catalog
    subgraph Catalog [Live Model Catalog :5051/v1/models]
        direction TB
        C1 -- curl --> M1[36 models]
        C2 -- curl --> M1
    end

    style ZESRouter fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style Relays fill:#e8f5e9,stroke:#388e3c,stroke-width:1px
    style Client fill:#fff3e0,stroke:#fb8c00,stroke-width:1px
```

---

## Component Map (Ports & Purpose)

| Component | Port | Upstream | Purpose | Key |
|-----------|------|----------|---------|-----|
| **ZESRouter daemon** | `:5051` | — | OpenAI‑compatible routing engine | BitRouter SDK, policy table |
| **Zen relay** | `:7077` | `https://opencode.ai/zen/v1` | Keyless free‑model pool (`*-free`) | `Authorization: Bearer public` |
| **NVIDIA bridge** | `:9456` | `https://integrate.api.nvidia.com/v1` | 20 NVIDIA Build models | `NVIDIA_API_KEY` env |
| **9Router** | `:20128` | OmniRoute local pool | Primary inference (`:20128` auto‑zes, auto‑best, auto‑vision) | keyless |
| **Pollinations** | `:7079` | `https://gen.pollinations.ai/v1` | 4 keyless models | none |
| **AI Horde** | `:8078` | Anonymous pool | AI Horde anon models | none |
| **Dashboard** | `:8080` | — | Frost UI + provider keys + logs | — |

---

## Data Flow (Typical Request)

```
Client (CLI / Codex)
    │
    ▼  POST /v1/chat/completions
    │
ZESRouter :5051
    │
    ├─ Policy Table → Tier: cheap (muse-spark-1.2-contributor-free)
    │   │
    │   └─► Zen Relay :7077 → opencode.ai/zen/v1
    │           │
    │           └─► Upstream: https://opencode.ai/zen/v1
    │                 │
    │                 └─► Model: muse-spark-1.2-contributor-free
    │
    ├─ Policy Table → Tier: flagship (anthropic/claude-sonnet-5)
    │   │
    │   └─► Zen Relay :7077 → opencode.ai/zen/v1
    │           │
    │           └─► Upstream: model fallback (muse‑spark first, then nvidia)
    │
    ├─ Explicit model: `nvidia:nvidia/z-ai/glm-5.2`
    │   │
    │   └─► NVIDIA Bridge :9456 → integrate.api.nvidia.com/v1
    │
    └─ Explicit model: `9router/auto-zes`
        │
        └─► 9Router :20128 → local LLM pool
```

---