import type { ReactNode } from "react";
import { Activity, AlertTriangle, Clock, DollarSign, Gauge, Layers, Server, Zap, Play, Gift, Bot, Languages } from "lucide-react";
import FrostCard from "../components/ui/FrostCard";
import Badge from "../components/ui/Badge";
import Sparkline from "../components/ui/Sparkline";
import EmptyState from "../components/ui/EmptyState";
import { useStore } from "../lib/store";
import { avgLatency, costSum, errorRate, groupByModel, hourlyBuckets, withinHours } from "../lib/stats";
import { localTime, truncate, usd, usdShort } from "../lib/format";
import { STRATEGIES, COMPRESSION_ENGINES, FREE_POOLS } from "../lib/catalog";
import type { PageId } from "../lib/nav";

export default function Dashboard({ setPage }: { setPage: (p: PageId, parts?: string[]) => void }) {
  const { health, requests, models, providers, dash, metrics, agents } = useStore();
  const last24h = withinHours(requests, 24);
  const cost = costSum(last24h);
  const lat = avgLatency(last24h);
  const errPct = errorRate(last24h);
  const buckets = hourlyBuckets(requests, 24);

  const byModel = groupByModel(last24h);
  const tierCount = { cheap: 0, flagship: 0 };
  for (const [modelId, reqs] of byModel) {
    const model = models.find((m) => m.id === modelId);
    if (model && model.tier) tierCount[model.tier] += reqs.length;
  }
  const totalTiered = tierCount.cheap + tierCount.flagship || 1;

  const topModels = [...byModel.entries()]
    .map(([id, reqs]) => ({ id, count: reqs.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const maxTop = Math.max(...topModels.map((m) => m.count), 1);
  const recentErrors = last24h.filter((r) => r.error).slice(0, 5);
  const enabledFree = FREE_POOLS.filter((p) => dash.freeEnabled[p.id] !== false && (dash.freeEnabled[p.id] || p.enabled)).length;
  const installedAgents = agents.filter((a) => a.installed).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <FrostCard variant="blue-bg" title="ZESRouter Gateway" subtitle="One OpenAI-compatible /v1 · BitRouter 1.0.0-alpha.27 · ZES tuned" icon={<Server size={16} />}
        action={<Badge variant={health.status === "ok" ? "green" : "red"} dot>{health.status.toUpperCase()}</Badge>}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="PID" value={String(health.pid)} />
          <Stat label="Listen" value={health.listen} mono />
          <Stat label="Models" value={String(health.models || models.length)} />
          <Stat label="Providers" value={`${providers.filter((p) => p.enabled).length}/${providers.length}`} />
        </div>
      </FrostCard>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <FrostCard className="!p-4">
          <MetricTile icon={<Activity size={16} />} label="Requests (24h)" value={last24h.length.toLocaleString()} color="text-blue-300" />
        </FrostCard>
        <FrostCard variant="green" className="!p-4">
          <MetricTile icon={<DollarSign size={16} />} label="Cost (24h)" value={usd(cost)} color="text-green-300" />
        </FrostCard>
        <FrostCard variant="orange" className="!p-4">
          <MetricTile icon={<Clock size={16} />} label={metrics ? "p95 latency" : "Avg latency"} value={`${metrics?.p95 ?? lat}ms`} color="text-orange-300" />
        </FrostCard>
        <FrostCard variant="red" className="!p-4">
          <MetricTile icon={<AlertTriangle size={16} />} label="Error Rate" value={`${errPct.toFixed(1)}%`} color="text-red-300" />
        </FrostCard>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Quick href={() => setPage("playground")} icon={<Play size={15} />} label="Playground" sub="stream any model" />
        <Quick href={() => setPage("combos")} icon={<Layers size={15} />} label="Combos" sub={`${STRATEGIES.length} strategies`} />
        <Quick href={() => setPage("free-tiers")} icon={<Gift size={15} />} label="Free tiers" sub={`${enabledFree} pools live`} />
        <Quick href={() => setPage("agents")} icon={<Bot size={15} />} label="ACP Agents" sub={`${installedAgents} installed`} />
      </div>

      <FrostCard title="Requests · last 24h" icon={<Gauge size={16} />}>
        <Sparkline values={buckets} color="#60a5fa" width={600} height={56} />
        <div className="mt-1 flex justify-between text-[10px] text-white/30">
          <span>-24h</span>
          <span>now</span>
        </div>
      </FrostCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FrostCard variant="orange" title="Tier Split" subtitle="cheap vs flagship · 24h" icon={<Layers size={16} />}>
          <div className="space-y-3">
            <TierBar label="Cheap" count={tierCount.cheap} total={totalTiered} color="bg-cyan-400" />
            <TierBar label="Flagship" count={tierCount.flagship} total={totalTiered} color="bg-orange-400" />
          </div>
        </FrostCard>

        <FrostCard variant="green" title="Top 5 Models" subtitle="by request count · 24h" icon={<Zap size={16} />}>
          {topModels.length === 0 ? (
            <EmptyState text="No requests in the last 24h yet." />
          ) : (
            <div className="space-y-2.5">
              {topModels.map((m) => (
                <div key={m.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate font-mono text-white/70">{m.id}</span>
                    <span className="shrink-0 text-white/40">{m.count}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-green-400" style={{ width: `${(m.count / maxTop) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </FrostCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FrostCard title="Routing + compression" subtitle={`${STRATEGIES.length} strategies · ${COMPRESSION_ENGINES.length} engines`} icon={<Languages size={16} />}
          action={<button onClick={() => setPage("analytics")} className="text-xs text-blue-300 hover:underline">Analytics →</button>}
        >
          <div className="flex flex-wrap gap-1.5">
            {STRATEGIES.slice(0, 10).map((s) => (
              <Badge key={s.id}>{s.name}</Badge>
            ))}
            <Badge variant="neutral">+{STRATEGIES.length - 10}</Badge>
          </div>
          <p className="mt-3 text-[11px] text-white/40">
            Default engine <span className="text-blue-200">{dash.settings.compressionDefault}</span> · level {dash.settings.compressionLevel} · RTK 15–95% savings
          </p>
        </FrostCard>

        <FrostCard variant="red" title="Recent Errors" subtitle="last 5 · 24h window" icon={<AlertTriangle size={16} />}
          action={<button onClick={() => setPage("traffic")} className="text-xs text-red-300 hover:underline">View all →</button>}
        >
          {recentErrors.length === 0 ? (
            <EmptyState text="No errors in the last 24h. Clean run!" good />
          ) : (
            <div className="space-y-2">
              {recentErrors.map((r) => (
                <div key={r.request_id} className="rounded-lg border border-red-400/15 bg-red-500/5 p-2.5 text-xs">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-white/50">
                    <span className="font-mono">{localTime(r.created_at)}</span>
                    <Badge>{r.model_id}</Badge>
                    <Badge variant="neutral">{r.provider_id}</Badge>
                  </div>
                  <p className="break-words text-red-300/90">{truncate(r.error ?? "", 120)}</p>
                </div>
              ))}
            </div>
          )}
        </FrostCard>
      </div>
    </div>
  );
}

function Quick({ href, icon, label, sub }: { href: () => void; icon: ReactNode; label: string; sub: string }) {
  return (
    <button onClick={href} className="frost-card frost-blue min-h-11 p-3 text-left active:scale-[0.99]">
      <div className="mb-1 text-blue-200">{icon}</div>
      <p className="text-sm font-semibold text-white">{label}</p>
      <p className="text-[11px] text-white/40">{sub}</p>
    </button>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.06] p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-white/40">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-semibold text-white/90 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function MetricTile({ icon, label, value, color }: { icon: ReactNode; label: string; value: string; color: string }) {
  return (
    <div>
      <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 ${color}`}>{icon}</div>
      <p className="text-lg font-bold text-white sm:text-xl">{value}</p>
      <p className="text-[11px] text-white/40">{label}</p>
    </div>
  );
}

function TierBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-white/60">
        <span>{label}</span>
        <span>{count} · {pct.toFixed(0)}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/5">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export { EmptyState };
export function fmtUsdShort(v: number) {
  return usdShort(v);
}
