import { KeyRound, KeySquare, Server } from "lucide-react";
import GlassCard from "../components/ui/GlassCard";
import Badge from "../components/ui/Badge";
import { useStore } from "../lib/store";
import { avgLatency, costSum, errorRate, withinHours } from "../lib/stats";
import { usd } from "../lib/format";
import { EmptyState } from "./Dashboard";

export default function Providers() {
  const { requests, providers } = useStore();
  const last24h = withinHours(requests, 24);

  const rows = providers.map((p) => {
    const reqs = last24h.filter((r) => r.provider_id === p.id);
    const success = reqs.filter((r) => !r.error).length;
    const errors = reqs.filter((r) => r.error).length;
    const rate = errorRate(reqs);
    return {
      ...p,
      count: reqs.length,
      success,
      errors,
      rate,
      latency: avgLatency(reqs),
      cost: costSum(reqs),
    };
  }).sort((a, b) => b.rate - a.rate);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((p) => {
          const isHot = p.rate > 20;
          return (
            <GlassCard
              key={p.id}
              variant={isHot ? "red" : "green"}
              title={p.name}
              subtitle={p.apiBase}
              icon={<Server size={16} />}
              action={<Badge variant={p.enabled ? "green" : "neutral"} dot>{p.enabled ? "enabled" : "disabled"}</Badge>}
            >
              <div className="mb-3 flex items-center gap-1.5 text-xs text-white/50">
                {p.hasKey ? <KeyRound size={13} className="text-green-400" /> : <KeySquare size={13} className="text-red-400" />}
                <span className="font-mono text-[11px]">{p.authEnvVar}</span>
                <Badge variant={p.hasKey ? (p.authEnvVar.startsWith("none") ? "cyan" : "green") : "red"} className="ml-auto">
                  {p.authEnvVar.startsWith("none") ? "keyless" : p.hasKey ? "key set" : "key missing"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <MiniStat label="Reqs (24h)" value={String(p.count)} />
                <MiniStat label="Success" value={String(p.success)} />
                <MiniStat label="Errors" value={String(p.errors)} accent={p.errors > 0 ? "text-red-400" : undefined} />
                <MiniStat label="Avg lat" value={`${p.latency}ms`} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-white/40">Cost (24h)</span>
                <span className="font-mono text-white/80">{usd(p.cost)}</span>
              </div>
              <div className="mt-2">
                <div className="mb-1 flex justify-between text-[10px] text-white/40">
                  <span>Error rate</span>
                  <span className={isHot ? "text-red-400" : "text-white/50"}>{p.rate.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className={`h-full rounded-full ${isHot ? "bg-red-500" : "bg-green-400"}`}
                    style={{ width: `${Math.min(p.rate, 100)}%` }}
                  />
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>
      {rows.every((r) => r.count === 0) && <EmptyState text="No provider traffic recorded in the last 24h yet." />}
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-white/35">{label}</p>
      <p className={`font-mono text-xs font-semibold ${accent ?? "text-white/85"}`}>{value}</p>
    </div>
  );
}
