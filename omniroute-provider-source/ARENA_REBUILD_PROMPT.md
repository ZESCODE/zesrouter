# ZESRouter Dashboard Full Rebuild - Arena Agent Prompt

OmniRoute-Inspired ZESROUTE Rebuild — Complete Agent Prompt

Project Overview

Goal: Rebuild ZESROUTE (currently BitRouter v1.0.0-alpha.27 wrapper) as a full-featured AI gateway inspired by OmniRoute — a Next.js-based unified AI proxy supporting 290+ providers, 500+ models, 19 routing strategies, token compression (15–95% savings), and a comprehensive management dashboard.
https://github.com/diegosouzapw/OmniRoute

Target: Mobile-first Termux deployment with full PWA support, plus desktop (Electron) and headless server modes.frost card design..must use frost blue as main/default.DONT USE plain glass card.
https://github.com/ZESCODE/frost-cards


Core Principle: One OpenAI-compatible endpoint (/v1/*) routing across multiple upstream providers with translation, fallback, token refresh, and usage tracking.

Technology Stack

Layer Technology
Frontend Next.js 16 (App Router) + React 19 + Tailwind CSS
Backend Next.js API Routes + Node.js 22 LTS
Database SQLite (persistent) + Redis (shared state/rate limiting)
Auth OAuth 2.0 (13 modules) + API keys
Proxy undici with proxy hardening
Desktop Electron 41 + electron-builder
Mobile PWA + Termux headless support
Monitoring OpenTelemetry + Prometheus metrics

Core Feature Modules to Build

1. Provider Ecosystem (/dashboard/providers)

four provider types:

· OAuth Providers: Claude Code, Codex, Gemini CLI, Qoder
• Free no OAuth:opencode,arena,duckgo(relay)
· API Key Providers: Groq, DeepSeek, OpenRouter, NVIDIA NIM, xAI
· Free Providers: iFlow, Qwen, Kiro (with credit balance tracking)

Provider page features:

· Add/Edit/Delete provider connections
· Per-provider model list with search/filter
· Per-model visibility toggle (hidden models excluded from /v1/models)
· Active-count badge (N/M active)
· OAuth "Repair env" one-click action
· Email privacy masking (e.g., di*****@g****.com)
· Credential health checks with TTL cache
· Provider health, rate limits, latency telemetry
· Circuit breaker states per provider
· Connection cooldown and model lockout

2. Routing Engine (/dashboard/combos)

19 routing strategies to implement:

Strategy Description
priority Fixed priority order
weighted Weighted random selection
round-robin Sequential distribution
random Random selection
least-used Least utilized provider
cost-optimized Cheapest healthy provider
strict-random True random with no weighting
auto 6-factor weighted scoring
fill-first Maximize quota usage per provider
p2c Power of Two Choices
lkgp Last Known Good Provider first
context-optimized Task-aware routing
context-relay Session continuity on account rotation
rules 6-factor: quota, health, cost, latency, taskFit, stability
cost/eco Cheapest healthy
latency/fast Lowest p95 latency with reliability penalty
sla-aware p95 latency + error-rate + cost SLOs

Combo builder features:

· Structured step-by-step builder — select provider, model, connection per step
· Repeated provider support (unique tuple required)
· Combo target health analytics
· Composite tier ordering (defaultTier → fallbackTier)
· Quick templates and readiness checks
· Auto-combo engine with candidate pooling

3. Token Compression Pipeline

12 compression engines to implement:

· RTK (Rapid Token Killer) — 15–95% token savings
· Caveman compression
· Multi-phase prompt compression
· Per-request configurable compression level
· Compression stats visible in analytics

4. Model Playground (/dashboard/playground)

Dashboard page to test any model directly:

· Provider/model/endpoint selectors
· Monaco Editor for prompt composition
· Real-time streaming responses
· Abort mid-stream
· Timing metrics display

5. MCP & A2A Support

MCP Server (built-in):

· 25+ tools with 3 transports: stdio, SSE, Streamable HTTP
· IDE configuration examples
· Client examples

A2A Server:

· Skills management
· JSON-RPC methods
· Streaming support
· Task lifecycle management

6. ACP Agents Dashboard (/dashboard/agents)

Grid of 14 built-in agents with:

· Installation status (Installed/Not Found with version detection)
· Protocol badges (stdio, HTTP, etc.)
· Custom agent registration form (name, binary, version command, spawn args)
· CLI Fingerprint Matching per provider

Built-in agents: Codex, Claude, Goose, Gemini CLI, OpenClaw, Aider, OpenCode, Cline, Qwen Code, ForgeCode, Amazon Q, Open Interpreter, Cursor CLI, Warp

7. Translator Playground (/dashboard/translator)

Four modes:

· Playground — Format converter
· Chat Tester — Live requests
· Test Bench — Batch tests
· Live Monitor — Real-time stream

8. Analytics (/dashboard/analytics)

Comprehensive usage analytics:

· Token consumption per provider/model
· Cost estimates with breakdowns
· Activity heatmaps
· Weekly distribution charts
· Per-provider breakdowns
· AI-powered usage pattern analysis

9. System Health (/dashboard/health)

Real-time monitoring:

· Uptime, memory, version
· Latency percentiles (p50/p95/p99)
· Cache statistics
· Provider circuit breaker states
· Active quota-monitored sessions
· Combo target health

10. CLI Tools + webhook (/dashboard/cli-tools)

One-click configuration for:

· Claude Code, Codex CLI, Gemini CLI, OpenClaw
· Kilo Code, Antigravity, Cline, Continue, Cursor, Factory Droid
· Automated config apply/reset
· Connection profiles
· Model mapping
• webhook panel

11. Settings (/dashboard/settings)

7 tabs:

Tab Features
General System storage, backup management (export/import database)
Appearance Theme selector (dark/light/system), 7 preset colors + custom hex, health log visibility, sidebar visibility
Security API endpoint protection, custom provider blocking, IP filtering, session info
Routing Model aliases, background task degradation
Resilience Rate limit persistence, circuit breaker tuning, auto-disable banned accounts, provider expiration monitoring, Context Relay threshold/config
Advanced Configuration overrides, audit trail, fallback degradation mode
Proxy Proxy configuration enforcement, token health check, OAuth refresh

12. Context Relay (/dashboard/context)

Session continuity on account rotation:

· Handoff threshold (default 85% quota usage)
· Max messages for summary
· Summary model override
· Structured handoff summary injection as system message

13. Free Tiers Dashboard (/dashboard/free-tiers)

Live summary of documented free tiers:

· 43 provider pools / 516 models aggregated
· Animated live summary
· Free forever badges
° option to +/- provider

Complete Dashboard Page List

```
/dashboard
├── /providers                 # Provider management (OAuth/API key/Free)
│   ├── Add Provider           # Connection wizard
│   ├── [provider]/edit        # Edit connection
│   └── [provider]/models      # Model list with visibility toggle
├── /combos                    # Routing combo builder
│   ├── Add Combo              # Structured step builder
│   └── [combo]/edit           # Edit combo
├── /analytics                 # Usage analytics
│   ├── /tokens                # Token consumption
│   ├── /cost                  # Cost estimates
│   └── /providers             # Per-provider breakdown
├── /health                    # System health monitoring
├── /playground                # Model playground (Monaco Editor)
├── /translator                # API translation debug
│   ├── /playground            # Format converter
│   ├── /chat-tester           # Live requests
│   ├── /test-bench            # Batch tests
│   └── /live-monitor          # Real-time stream
├── /agents                    # ACP Agents dashboard
│   ├── /built-in              # 14 built-in agents grid
│   └── /custom                # Custom agent registration
├── /cli-tools                 # One-click CLI configuration
├── /context                   # Context Relay settings
├── /free-tiers                # Free tiers live summary
├── /settings                  # Comprehensive settings
│   ├── /general               # Storage & backup
│   ├── /appearance            # Themes & sidebar
│   ├── /security              # API protection & filtering
│   ├── /routing               # Model aliases
│   ├── /resilience            # Circuit breaker & rate limits
│   ├── /advanced              # Overrides & audit
│   └── /proxy                 # Proxy configuration
└── /logs                      # Real-time console viewer[reference:51]
```

Termux Mobile Optimization Requirements

Deployment:

```bash
pkg install nodejs
npx -y omniroute
# Runs 24/7, no root required
```

Mobile-first design:

· PWA support — "Add to Home Screen" for fullscreen, offline-capable, installable from browser
· Responsive breakpoints — Optimized for 360px–430px mobile viewports
· Touch-friendly — Minimum 44px touch targets, swipe gestures for navigation
· Bottom navigation — Mobile-optimized tab bar replacing sidebar on small screens
· Collapsible sections — Progressive disclosure for complex settings
· Reduced animations — prefers-reduced-motion support
· Bandwidth-aware — Lazy loading, compressed assets, offline caching
· Headless mode — API-only operation without UI for low-resource devices

Desktop app: Electron 41 with auto-update
Headless server: API-only mode for Raspberry Pi / low-resource deployments

Development Phases

Phase 1: Foundation 

· Next.js 16 + TypeScript + frost design project setup
· SQLite schema + Redis integration
· Basic provider CRUD (API key providers only)
· Single OpenAI-compatible endpoint (/v1/chat/completions)

Phase 2: Provider Expansion 

· All 290+ provider connectors
· OAuth modules (13 providers)
· Provider health checks + circuit breaker
· Provider dashboard UI

Phase 3: Routing Engine 

· All 19 routing strategies
· Combo builder UI
· Auto-combo engine with 6-factor scoring
· Fallback chain execution

Phase 4: Token Compression 

· 12 compression engines
· Per-request compression config
· Compression analytics

Phase 5: Dashboard Completion 

· All dashboard pages
· Model Playground
· Translator Playground
· ACP Agents dashboard
· CLI Tools
· Settings (all 7 tabs)

Phase 6: Mobile & Deployment 

· PWA configuration
· Termux optimization
· Electron desktop app
· Docker + Railway deployment

Phase 7: Advanced Features 

· Context Relay
· MCP Server + A2A Server
· Request deduplication
· Multilingual intent detection (30+ languages)

Success Metrics

Metric Target
Providers supported 290+
Models supported 500+
Routing strategies 19
Token compression 15–95% savings
Dashboard pages 15+
Mobile responsive 100% pages
PWA installable Yes
Termux deployment < 2 minutes

Key OmniRoute Features to Preserve in ZESROUTE

1. ZES-stack tuning — Keep ZESROUTE's unique model optimization
2. Binary verification — Maintain security-first approach
3. Termux + proot-distro Debian — Optimize further with PWA
4. Single-file dashboard — Can be enhanced, not replaced

Remember: The goal is to upgrade ZESROUTE with OmniRoute's capabilities while preserving its unique identity — not to clone OmniRoute. Keep ZESROUTE's lightweight philosophy while adding enterprise-grade features.