# ZESRouter UI

Web control panel for the ZESRouter daemon (BitRouter 1.0.0-alpha.27).
React 19 + Vite 7 single-file build, served by a zero-dependency Python3
backend that shells the BitRouter CLI inside proot and reads its SQLite DB.

Frost-blue card design (not plain glass). Mobile-first PWA with bottom nav.

## Run

```bash
cd ~/zesrouter/ui
python3 server.py            # serves dist/ + JSON API on http://localhost:8080
```

Requirements: python3 + pyyaml (Termux: `pkg install python` + `pip install pyyaml`),
proot-distro Debian with BitRouter running on :4356.

## Pages

| Hash | What |
|------|------|
| `#dashboard` | Gateway home — status, traffic, shortcuts |
| `#providers` | Provider ecosystem (OAuth / API key / free) + wizard + models |
| `#combos` | 19 routing strategies + step builder + auto-combo |
| `#analytics` | Tokens / cost / providers + heatmap |
| `#health` | p50/p95/p99, cache, circuit breakers, quota sessions |
| `#playground` | Stream any model, abort, compression, timings |
| `#translator` | Format converter, chat tester, test bench, live monitor |
| `#agents` | 14 built-in ACP agents + custom registration |
| `#cli-tools` | One-click CLI profiles + webhooks |
| `#context` | Context Relay handoff settings |
| `#free-tiers` | 43 pools / 500+ models, enable/disable |
| `#settings/*` | General, Appearance, Security, Routing, Resilience, Advanced, Proxy |
| `#logs` | Real-time daemon console |
| `#keys` `#traffic` `#policy` `#backups` `#models` `#events` | Ops |

## API

Existing: `/api/health`, `/api/status`, `/api/models`, `/api/providers`, `/api/policy`,
`/api/requests`, `/api/stats/*`, `/api/route`, `/api/keys*`, `/api/config*`,
`/api/backups*`, `/api/daemon`, `/api/logs`.

New: `/api/dash/state`, `/api/dash/export`, `/api/dash/import`, `/api/health/metrics`,
`/api/agents`, `/api/oauth/repair`, `/api/cli-tools`, `/api/playground`.

Dashboard extras persist in `~/.zesrouter/dashboard-state.json`.

## Rebuild (only if editing src)

```bash
cd ~/zesrouter/ui
npm install
npm run build        # -> dist/index.html (single file, committed)
```

## Notes

- No secrets: provider keys shown as set/missing only; created virtual keys shown once
- Hidden models are dropped from `/api/models` (and therefore the dashboard catalog)
- PWA: `manifest.webmanifest` + `sw.js` — Add to Home Screen on mobile
- Headless: the Python API works without opening the UI

## License

UI code: MIT (ZES). Backend consumes BitRouter CLI — Apache-2.0 upstream.
