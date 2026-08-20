# ZESRouter UI

Web control panel for the ZESRouter daemon (BitRouter 1.0.0-alpha.27).
React 19 + Vite 7 single-file build, served by a zero-dependency Python3
backend that shells the BitRouter CLI inside proot and reads its SQLite DB.

## Run

```bash
cd ~/zesrouter/ui
python3 server.py            # serves dist/ + JSON API on http://localhost:8080
```

Requirements: python3 + pyyaml (Termux: `pkg install python` + `pip install pyyaml`),
proot-distro Debian with BitRouter running on :4356.

## Pages

| Page | Data source |
|------|-------------|
| Dashboard | /health, CLI status, requests table (24h aggregates, tier split, top models, recent errors) |
| Models | CLI `models`, `route` — routing table + test route |
| Providers | config providers + env presence + requests table stats |
| Policy | policy_table from config (tiers, fingerprints, adequacy) |
| Keys | api_keys table + CLI `key sign` |
| Traffic | requests table — filters, pagination, hourly sparkline |
| Settings | config file read/write/validate/reload, .bak-* restore, daemon stop/start |
| SystemHealth | provider error-derived health (no OmniRoute data — BitRouter has none) |
| LiveEvents | derived from recent errored requests |

## API

All under `/api/` (JSON): health, status, models, providers, policy, requests,
stats/dashboard, route, keys, keys/create, keys/revoke, config,
config/validate, config/save, backups, backups/restore, daemon.

CLI calls run as:
`proot-distro login debian -- bitrouter.orig <cmd> --config /root/.bitrouter/bitrouter.yaml --json`

## Rebuild (only if editing src)

```bash
cd ~/zesrouter/ui
npm install
npm run build        # -> dist/index.html (single file, committed)
```

## Notes

- No secrets: provider keys shown as set/missing only; created virtual keys shown once
- requests table may be empty if daemon idle — UI renders empty states
- Daemon data spans ~/logs/bitrouter/ + proot /root/.bitrouter/

## License

UI code: MIT (ZES). Backend consumes BitRouter CLI — Apache-2.0 upstream.