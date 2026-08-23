import { useMemo, useState } from "react";
import { Gift, Plus, Minus } from "lucide-react";
import FrostCard from "../components/ui/FrostCard";
import Badge from "../components/ui/Badge";
import { FREE_POOLS } from "../lib/catalog";
import { useStore, saveDash } from "../lib/store";

export default function FreeTiers() {
  const { dash } = useStore();
  const [q, setQ] = useState("");
  const pools = useMemo(() => FREE_POOLS.map((p) => ({
    ...p,
    enabled: dash.freeEnabled[p.id] ?? p.enabled,
  })), [dash.freeEnabled]);

  const shown = pools.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.id.includes(q.toLowerCase()));
  const on = pools.filter((p) => p.enabled);
  const models = on.reduce((s, p) => s + p.models, 0);
  const allModels = pools.reduce((s, p) => s + p.models, 0);

  function setEnabled(id: string, v: boolean) {
    saveDash({ freeEnabled: { ...dash.freeEnabled, [id]: v } });
  }

  return (
    <div className="space-y-4">
      <FrostCard variant="blue-bg" title="Free tiers live summary" subtitle={`${pools.length} provider pools · ${allModels} models aggregated`} icon={<Gift size={16} />}>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="frost-live text-2xl font-bold text-blue-100">{on.length}</p>
            <p className="text-[11px] text-white/40">pools on</p>
          </div>
          <div>
            <p className="frost-live text-2xl font-bold text-blue-100">{models}</p>
            <p className="text-[11px] text-white/40">models live</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-200">{on.filter((p) => p.forever).length}</p>
            <p className="text-[11px] text-white/40">free forever</p>
          </div>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter pools…" className="frost-input mt-4" />
      </FrostCard>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((p) => (
          <FrostCard key={p.id} variant={p.enabled ? "blue" : "orange"} title={p.name} subtitle={`${p.models} models · ${p.region}`}
            action={p.forever ? <Badge variant="green">free forever</Badge> : <Badge variant="orange">quota</Badge>}
          >
            <div className="flex gap-2">
              <button className="frost-btn frost-btn-frost !min-h-11" onClick={() => setEnabled(p.id, true)}><Plus size={13} /> Enable</button>
              <button className="frost-btn !min-h-11" onClick={() => setEnabled(p.id, false)}><Minus size={13} /> Disable</button>
            </div>
            <p className="mt-2 text-[11px] text-white/40">{p.enabled ? "included in live summary" : "parked"}</p>
          </FrostCard>
        ))}
      </div>
    </div>
  );
}
