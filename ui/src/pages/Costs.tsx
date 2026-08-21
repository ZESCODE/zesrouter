import type { ReactNode } from "react";
import { Activity, BarChart, DollarSign, PieChart, TrendingUp, Wallet } from "lucide-react";
import GlassCard from "../components/ui/GlassCard";
import Badge from "../components/ui/Badge";
import { useStore } from "../lib/store";
import { usd } from "../lib/format";
import { EmptyState } from "./Dashboard";

export default function Costs() {
  const { costs, providers } = useStore();

  const totalSpend = (costs?.byProvider ?? []).reduce((s, p) => s + p.cost_micro, 0);
  const totalRequests = (costs?.byProvider ?? []).reduce((s, p) => s + p.requests, 0);
  const totalLatMs = (costs?.byProvider ?? []).reduce((s, p) => s + p.requests * (p.avg_latency_ms ?? 0), 0);
  const avgLat = totalRequests ? Math.round(totalLatMs / totalRequests) : 0;
  const daysTracked = costs?.daily.length ?? 0;
  const total14d = (costs?.daily ?? []).reduce((s, d) => s + d.requests, 0);

  const providerName = new Map(providers.map((p) => [p.id, p.name]));
  const hasData = !!costs && (costs.byProvider.length > 0 || costs.byModel.length > 0 || costs.daily.length > 0);

  if (!hasData) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <GlassCard variant="neutral" title="Costs" subtitle="usage & spend analytics" icon={<BarChart size={16} />}>
          <EmptyState text="No cost data yet. Stats appear after traffic flows." />
        </GlassCard>
      </div>
    );
  }

  const maxDaily = Math.max(...(costs!.daily.map((d) => d.cost_micro)), 1);
  const dense = costs!.daily.length > 7;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <GlassCard variant="blue" className="!p-4">
          <MetricTile icon={<Wallet size={16} />} label="Spend (24h)" value={usd(totalSpend)} color="text-blue-400" />
        </GlassCard>
        <GlassCard variant="green" className="!p-4">
          <MetricTile icon={<Activity size={16} />} label="Requests (24h)" value={totalRequests.toLocaleString()} color="text-green-400" />
        </GlassCard>
        <GlassCard variant="cyan" className="!p-4">
          <MetricTile icon={<TrendingUp size={16} />} label="Avg Latency" value={`${avgLat}ms`} color="text-cyan-400" />
        </GlassCard>
        <GlassCard variant="orange" className="!p-4">
          <MetricTile icon={<PieChart size={16} />} label="Days Tracked" value={daysTracked ? `${daysTracked}d` : "—"} color="text-orange-400" />
        </GlassCard>
      </div>

      <GlassCard variant="blue" title="Daily spend" subtitle="14 days · errors highlighted" icon={<BarChart size={16} />}>
        {costs!.daily.length === 0 ? (
          <EmptyState text="No daily stats yet." />
        ) : (
          <div>
            <div className="flex h-40 items-end gap-1">
              {costs!.daily.map((d) => {
                const h = Math.max(2, (d.cost_micro / maxDaily) * 100);
                return (
                  <div key={d.day} className="group flex flex-1 flex-col items-center justify-end gap-1">
                    <div
                      title={`${d.day} · ${usd(d.cost_micro)} · ${d.requests.toLocaleString()} req`}
                      className={`w-full rounded-t ${d.errors > 0 ? "bg-orange-400" : "bg-blue-400"} transition-opacity hover:opacity-80`}
                      style={{ height: `${h}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex gap-1">
              {costs!.daily.map((d) => (
                <span key={d.day} className="flex-1 truncate text-center text-[9px] text-white/35">
                  {dense ? d.day.slice(8) : d.day.slice(5)}
                </span>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-4 text-[10px] text-white/40">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-blue-400" /> spend
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-orange-400" /> errors
              </span>
              <span className="ml-auto">{total14d.toLocaleString()} req · 14d</span>
            </div>
          </div>
        )}
      </GlassCard>

      <GlassCard variant="green" title="Spend by provider" subtitle="24h · desc by cost" icon={<PieChart size={16} />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-white/35">
                <th className="py-2 pr-3 font-medium">Provider</th>
                <th className="py-2 pr-3 font-medium">Requests</th>
                <th className="py-2 pr-3 font-medium">Avg Lat</th>
                <th className="py-2 pr-3 font-medium">Spend</th>
              </tr>
            </thead>
            <tbody>
              {costs!.byProvider.map((p) => (
                <tr key={p.provider_id} className="border-b border-white/5 last:border-0">
                  <td className="py-2.5 pr-3">
                    <Badge variant="neutral">{providerName.get(p.provider_id ?? "") ?? p.provider_id ?? "unknown"}</Badge>
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-white/85">{p.requests.toLocaleString()}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-white/70">
                    {p.avg_latency_ms != null ? `${Math.round(p.avg_latency_ms)}ms` : "—"}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-green-300">{usd(p.cost_micro)}</td>
                </tr>
              ))}
              {costs!.byProvider.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-xs text-white/35">
                    No provider spend yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <GlassCard variant="orange" title="Spend by model" subtitle="top 10 · 24h" icon={<DollarSign size={16} />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-white/35">
                <th className="py-2 pr-3 font-medium">Model</th>
                <th className="py-2 pr-3 font-medium">Requests</th>
                <th className="py-2 pr-3 font-medium">Spend</th>
              </tr>
            </thead>
            <tbody>
              {costs!.byModel.slice(0, 10).map((m) => (
                <tr key={m.model_id} className="border-b border-white/5 last:border-0">
                  <td className="py-2.5 pr-3 font-mono text-xs text-white/85">{m.model_id ?? "unknown"}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-white/70">{m.requests.toLocaleString()}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-orange-300">{usd(m.cost_micro)}</td>
                </tr>
              ))}
              {costs!.byModel.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-xs text-white/35">
                    No model spend yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
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