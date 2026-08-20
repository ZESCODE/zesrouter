import { Cpu, Database, Network, Waves } from "lucide-react";
import GlassCard from "../components/ui/GlassCard";
import Badge from "../components/ui/Badge";
import { useStore } from "../lib/store";
import { duration, timeAgo, usd } from "../lib/format";

export default function SystemHealth() {
  const { omniroute, providers, requests, keys, policy } = useStore();
  const enabled = providers.filter((p) => p.enabled).length;
  const keyed = providers.filter((p) => p.hasKey).length;
  const totalCost = requests.reduce((s, r) => s + r.estimated_charge_micro_usd, 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <GlassCard
        variant="cyan"
        title="ZESRouter Daemon"
        subtitle="http://localhost:4356 · BitRouter 1.0.0-alpha.27"
        icon={<Network size={16} />}
        action={
          <Badge variant={omniroute.reachable ? "green" : "red"} dot>
            {omniroute.reachable ? "reachable" : "unreachable"}
          </Badge>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile label="Uptime" value={duration(omniroute.uptime_sec)} />
          <Tile label="Requests (24h)" value={String(omniroute.active_connections)} />
          <Tile label="Reachability" value={omniroute.reachable ? "OK" : "DOWN"} />
        </div>
      </GlassCard>

      <GlassCard variant="red" title="Provider Health" subtitle="error-derived circuit state · last 24h" icon={<Waves size={16} />}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {providers.map((p) => {
            const cb = omniroute.circuit_breakers.find((c) => c.provider_id === p.id);
            const state = cb?.state ?? "closed";
            const stateColor = state === "closed" ? "green" : state === "half-open" ? "orange" : "red";
            return (
              <div
                key={p.id}
                className={`rounded-xl border p-3 ${
                  state === "open" ? "border-red-400/30 bg-red-500/5" : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-white/85">{p.name}</span>
                  <Badge variant={stateColor} dot>
                    {state}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-white/40">
                  <span>Failures: {cb?.failure_count ?? 0}</span>
                  <span>{cb?.last_failure_at ? timeAgo(cb.last_failure_at) : "never"}</span>
                </div>
              </div>
            );
          })}
          {providers.length === 0 && (
            <p className="col-span-full rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-white/35">
              Loading provider health…
            </p>
          )}
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GlassCard variant="blue" title="Providers" icon={<Cpu size={16} />}>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Tile label="Total" value={String(providers.length)} />
            <Tile label="Enabled" value={String(enabled)} />
            <Tile label="Key set" value={String(keyed)} />
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-blue-400"
              style={{ width: `${providers.length ? (enabled / providers.length) * 100 : 0}%` }}
            />
          </div>
        </GlassCard>

        <GlassCard variant="orange" title="Database" subtitle="~/.bitrouter/bitrouter.db" icon={<Database size={16} />}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Rows (24h)" value={String(requests.length)} />
            <Tile label="Cost (24h)" value={usd(totalCost)} />
            <Tile label="Virtual keys" value={String(keys.length)} />
            <Tile label="Adequacy" value={policy?.adequacy.enabled ? "enabled" : "off"} />
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.04] p-3 text-center">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-white/35">{label}</p>
    </div>
  );
}