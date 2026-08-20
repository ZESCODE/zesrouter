import type { ReactNode } from "react";
import { Activity, AlertTriangle, Clock, DollarSign, Gauge, Layers, Server, Zap } from "lucide-react";
import GlassCard from "../components/ui/GlassCard";
import Badge from "../components/ui/Badge";
import Sparkline from "../components/ui/Sparkline";
import { useStore } from "../lib/store";
import { avgLatency, costSum, errorRate, groupByModel, hourlyBuckets, withinHours } from "../lib/stats";
import { localTime, truncate, usd, usdShort } from "../lib/format";
import type { PageId } from "../lib/nav";

export default function Dashboard({ setPage }: { setPage: (p: PageId) => void }) {
  const { health, requests, models } = useStore();
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

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Status card */}
      <GlassCard variant="blue" title="Daemon Status" subtitle="BitRouter 1.0.0-alpha.27 · ZES tuned" icon={<Server size={16} />}
        action={<Badge variant={health.status === "ok" ? "green" : "red"} dot>{health.status.toUpperCase()}</Badge>}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="PID" value={String(health.pid)} />
          <Stat label="Listen" value={health.listen} mono />
          <Stat label="Models" value={String(health.models)} />
          <Stat label="Config" value={health.configName} mono />
        </div>
      </GlassCard>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <GlassCard variant="blue" className="!p-4">
          <MetricTile icon={<Activity size={16} />} label="Requests (24h)" value={last24h.length.toLocaleString()} color="text-blue-400" />
        </GlassCard>
        <GlassCard variant="green" className="!p-4">
          <MetricTile icon={<DollarSign size={16} />} label="Cost (24h)" value={usd(cost)} color="text-green-400" />
        </GlassCard>
        <GlassCard variant="orange" className="!p-4">
          <MetricTile icon={<Clock size={16} />} label="Avg Latency" value={`${lat}ms`} color="text-orange-400" />
        </GlassCard>
        <GlassCard variant="red" className="!p-4">
          <MetricTile icon={<AlertTriangle size={16} />} label="Error Rate" value={`${errPct.toFixed(1)}%`} color="text-red-400" />
        </GlassCard>
      </div>

      {/* Sparkline */}
      <GlassCard variant="blue" title="Requests · last 24h" icon={<Gauge size={16} />}>
        <Sparkline values={buckets} color="#60a5fa" width={600} height={56} />
        <div className="mt-1 flex justify-between text-[10px] text-white/30">
          <span>-24h</span>
          <span>now</span>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Tier split */}
        <GlassCard variant="orange" title="Tier Split" subtitle="cheap vs flagship · 24h" icon={<Layers size={16} />}>
          <div className="space-y-3">
            <TierBar label="Cheap" count={tierCount.cheap} total={totalTiered} color="bg-cyan-400" />
            <TierBar label="Flagship" count={tierCount.flagship} total={totalTiered} color="bg-orange-400" />
          </div>
        </GlassCard>

        {/* Top models */}
        <GlassCard variant="green" title="Top 5 Models" subtitle="by request count · 24h" icon={<Zap size={16} />}>
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
        </GlassCard>
      </div>

      {/* Recent errors */}
      <GlassCard variant="red" title="Recent Errors" subtitle="last 5 · 24h window" icon={<AlertTriangle size={16} />}
        action={<button onClick={() => setPage("traffic")} className="text-xs text-red-300 hover:underline">View all →</button>}
      >
        {recentErrors.length === 0 ? (
          <EmptyState text="No errors in the last 24h. Clean run! 🎉" good />
        ) : (
          <div className="space-y-2">
            {recentErrors.map((r) => (
              <div key={r.request_id} className="rounded-lg border border-red-400/15 bg-red-500/5 p-2.5 text-xs">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-white/50">
                  <span className="font-mono">{localTime(r.created_at)}</span>
                  <Badge variant="blue">{r.model_id}</Badge>
                  <Badge variant="neutral">{r.provider_id}</Badge>
                </div>
                <p className="break-words text-red-300/90">{truncate(r.error ?? "", 120)}</p>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.04] p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-white/35">{label}</p>
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
        <span>
          {count} · {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/5">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({ text, good }: { text: string; good?: boolean }) {
  return (
    <p className={`rounded-lg border border-dashed p-4 text-center text-xs ${good ? "border-green-400/20 text-green-300/70" : "border-white/10 text-white/35"}`}>
      {text}
    </p>
  );
}

export function fmtUsdShort(v: number) {
  return usdShort(v);
}
