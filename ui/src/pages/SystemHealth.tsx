import { Cpu, Database, Network, Waves, MemoryStick } from "lucide-react";
import FrostCard from "../components/ui/FrostCard";
import Badge from "../components/ui/Badge";
import { useStore } from "../lib/store";
import { duration, timeAgo, usd } from "../lib/format";

export default function SystemHealth() {
  const { omniroute, providers, requests, keys, policy, metrics, dash, health } = useStore();
  const enabled = providers.filter((p) => p.enabled).length;
  const keyed = providers.filter((p) => p.hasKey).length;
  const totalCost = requests.reduce((s, r) => s + r.estimated_charge_micro_usd, 0);
  const comboReady = dash.combos.filter((c) => c.enabled && c.steps.every((s) => s.provider && s.model)).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <FrostCard variant="blue-bg" title="ZESRouter Daemon" subtitle="http://localhost:4356 · BitRouter 1.0.0-alpha.27" icon={<Network size={16} />}
        action={<Badge variant={omniroute.reachable ? "green" : "red"} dot>{omniroute.reachable ? "reachable" : "unreachable"}</Badge>}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Uptime" value={duration(omniroute.uptime_sec)} />
          <Tile label="Version" value={metrics?.version || "1.0.0-alpha.27"} />
          <Tile label="Memory" value={`${metrics?.memoryMb ?? "—"} MB`} />
          <Tile label="PID" value={String(health.pid || "—")} />
        </div>
      </FrostCard>

      <FrostCard title="Latency percentiles" subtitle="last 24h" icon={<Waves size={16} />}>
        <div className="grid grid-cols-3 gap-3">
          <Tile label="p50" value={`${metrics?.p50 ?? 0}ms`} />
          <Tile label="p95" value={`${metrics?.p95 ?? 0}ms`} />
          <Tile label="p99" value={`${metrics?.p99 ?? 0}ms`} />
        </div>
      </FrostCard>

      <FrostCard variant="cyan" title="Cache" icon={<Database size={16} />}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Hit ratio" value={`${Math.round((metrics?.cacheHit ?? omniroute.cache.hit_ratio) * 100)}%`} />
          <Tile label="Read tok" value={String(metrics?.cacheRead ?? 0)} />
          <Tile label="Write tok" value={String(metrics?.cacheWrite ?? 0)} />
          <Tile label="Size" value={`${omniroute.cache.size_mb} MB`} />
        </div>
      </FrostCard>

      <FrostCard variant="red" title="Provider circuit breakers" subtitle="error-derived + cooldown" icon={<Waves size={16} />}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {providers.map((p) => {
            const cb = omniroute.circuit_breakers.find((c) => c.provider_id === p.id);
            const state = cb?.state ?? "closed";
            const stateColor = state === "closed" ? "green" : state === "half-open" ? "orange" : "red";
            return (
              <div key={p.id} className={`rounded-xl border p-3 ${state === "open" ? "border-red-400/30 bg-red-500/5" : "border-blue-400/15 bg-white/[0.03]"}`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-white/85">{p.name}</span>
                  <Badge variant={stateColor} dot>{state}</Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-white/40">
                  <span>Failures: {cb?.failure_count ?? 0}</span>
                  <span>{cb?.last_failure_at ? timeAgo(cb.last_failure_at) : "never"}</span>
                </div>
                {cb?.cooldown_until && <p className="mt-1 text-[10px] text-orange-300">cooldown {cb.cooldown_until}</p>}
              </div>
            );
          })}
        </div>
      </FrostCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FrostCard title="Quota sessions" icon={<Cpu size={16} />}>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Tile label="Active" value={String(metrics?.quotaSessions ?? 0)} />
            <Tile label="Combos ready" value={`${comboReady}/${dash.combos.length}`} />
            <Tile label="Relay thr" value={`${dash.context.handoffThreshold}%`} />
          </div>
        </FrostCard>
        <FrostCard variant="orange" title="Database" subtitle="~/.bitrouter/bitrouter.db" icon={<MemoryStick size={16} />}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Rows (24h)" value={String(requests.length)} />
            <Tile label="Cost (24h)" value={usd(totalCost)} />
            <Tile label="Virtual keys" value={String(keys.length)} />
            <Tile label="Adequacy" value={policy?.adequacy.enabled ? "enabled" : "off"} />
          </div>
          <p className="mt-3 text-[11px] text-white/35">Providers {enabled}/{providers.length} enabled · {keyed} keyed</p>
        </FrostCard>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.05] p-3 text-center">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-white/35">{label}</p>
    </div>
  );
}
