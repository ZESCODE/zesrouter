# Providers — Index

| Doc | Purpose | Updated |
|-----|---------|---------|
| [`zesrouter.md`](./zesrouter.md) | **Canonical ZESRouter catalog** — 36 live models, 8 providers, bridges (`:7077`, `:9456`), policy table, dashboard `:8080`, OpenCode free update `deepseek-v4-flash-free` → `muse-spark-1.2-contributor-free` + `big-pickle`/`x-preview-f-free`, verification & troubleshooting | 2026-08-21 |
| [`bitrouter.md`](./bitrouter.md) | Legacy overview (BitRouter → ZESRouter rename). Now points to `zesrouter.md` for catalog. | 2026-08-21 |
| [`k.txt.txt`](./k.txt.txt) | Redacted provider keys dump (values in `~/.secure-credentials/master.env` only) | 2026-08-19 |
| [`live-catalog.json`](./live-catalog.json) | Machine-readable dump of `curl http://127.0.0.1:4356/v1/models` (36 ids) | 2026-08-21 |

## Quick Links

- **Live check:** `curl -s http://127.0.0.1:4356/v1/models | jq -r '.data[].id' | sort`
- **Config:** `~/zesrouter/configs/bitrouter.yaml:1`
- **Relays:** `~/zesrouter/relay/zen_relay.py:1` (`:7077` → `https://opencode.ai/zen/v1`), `~/zesrouter/relay/nvidia_bridge.py:1` (`:9456` → `https://integrate.api.nvidia.com/v1`)
- **Dashboard:** `http://127.0.0.1:8080` (Frost, provider keys via `POST /api/providers/key` in `~/zesrouter/ui/server.py:172`)
- **Opencode free CLI:** `opencode models opencode` (curated 7) vs. `~/.cache/opencode/models.json:opencode` (29 free cost 0, incl. deprecated `deepseek-v4-flash-free`)
- **Topology:** [`/zesrouter/docs/topo/overview.md`](/zesrouter/docs/topo/overview.md) — vertical schematic, component map, data flow

## Update Note (2026-08-21)

**OpenCode free tier** rotated: `deepseek-v4-flash-free` (`status: deprecated` in `models.json`, 2026-07-31) removed from `opencode models` curated list, replaced by `muse-spark-1.2-contributor-free` (1M context, 2026-08-05). New free models `opencode/big-pickle` (200k) and `opencode/x-preview-f-free` (Ox Alpha, 1M, 2026-08-21) added upstream — add to `bitrouter.yaml` + `zen_relay.py:13 EXTRA_MODELS`. See [`zesrouter.md` § OpenCode Free CLI Update](./zesrouter.md#opencode-free-cli-update--2026-08-21).
