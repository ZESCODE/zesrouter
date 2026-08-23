import { useMemo, useState } from "react";
import { Layers3, Plus, Trash2, ArrowLeft, Sparkles, CheckCircle2 } from "lucide-react";
import FrostCard from "../components/ui/FrostCard";
import Badge from "../components/ui/Badge";
import EmptyState from "../components/ui/EmptyState";
import Toggle from "../components/ui/Toggle";
import { useStore, saveDash } from "../lib/store";
import { STRATEGIES } from "../lib/catalog";
import { withinHours } from "../lib/stats";
import type { Combo, ComboStep } from "../lib/types";
import type { PageId } from "../lib/nav";

const TEMPLATES: { name: string; strategy: string; hint: string }[] = [
  { name: "Eco chain", strategy: "cost", hint: "cheapest healthy first" },
  { name: "Fast lane", strategy: "latency", hint: "lowest p95" },
  { name: "SLA gold", strategy: "sla-aware", hint: "p95 + errors + cost" },
  { name: "Fill quota", strategy: "fill-first", hint: "burn remaining quota" },
  { name: "Auto 6-factor", strategy: "auto", hint: "quota·health·cost·lat·fit·stab" },
];

export default function Combos({ parts, setPage }: { parts: string[]; setPage: (p: PageId, parts?: string[]) => void }) {
  const editId = parts[0] === "add" ? "new" : parts[0] && parts[1] === "edit" ? parts[0] : "";
  if (editId) return <ComboBuilder id={editId} onBack={() => setPage("combos")} />;
  return <ComboList setPage={setPage} />;
}

function ComboList({ setPage }: { setPage: (p: PageId, parts?: string[]) => void }) {
  const { dash, requests, providers } = useStore();
  const last24h = withinHours(requests, 24);

  return (
    <div className="space-y-4">
      <FrostCard variant="blue-bg" title="Routing combos" subtitle={`${STRATEGIES.length} strategies · unique provider/model/connection tuples`} icon={<Layers3 size={16} />}
        action={<button onClick={() => setPage("combos", ["add"])} className="frost-btn frost-btn-frost"><Plus size={14} /> Add combo</button>}
      >
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map((t) => (
            <button key={t.name} className="frost-btn !min-h-11" onClick={() => setPage("combos", ["add"])} title={t.hint}>
              <Sparkles size={12} /> {t.name}
            </button>
          ))}
        </div>
      </FrostCard>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {STRATEGIES.map((s) => (
          <div key={s.id} className="rounded-xl border border-blue-400/15 bg-white/[0.03] px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-white/85">{s.name}</span>
              <Badge>{s.id}</Badge>
            </div>
            <p className="mt-1 text-[11px] text-white/40">{s.description}</p>
          </div>
        ))}
      </div>

      {dash.combos.length === 0 ? (
        <EmptyState text="No combos yet — add one or start from a template." />
      ) : (
        dash.combos.map((c) => {
          const health = comboHealth(c, last24h);
          return (
            <FrostCard key={c.id} title={c.name} subtitle={`${c.strategy} · ${c.steps.length} steps · ${c.defaultTier} → ${c.fallbackTier}`}
              action={<Badge variant={c.enabled ? "green" : "neutral"}>{c.enabled ? "on" : "off"}</Badge>}
            >
              <div className="mb-3 flex flex-wrap gap-1.5">
                {c.steps.map((s, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <Badge>{s.provider}</Badge>
                    <span className="font-mono text-[10px] text-white/40">{s.model}</span>
                    {i < c.steps.length - 1 && <span className="text-white/25">→</span>}
                  </span>
                ))}
              </div>
              <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
                <Mini label="Readiness" value={health.ready} />
                <Mini label="Err%" value={health.err} />
                <Mini label="pLat" value={health.lat} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="frost-btn frost-btn-frost" onClick={() => setPage("combos", [c.id, "edit"])}>Edit</button>
                <button className="frost-btn frost-btn-destructive" onClick={() => saveDash({ combos: dash.combos.filter((x) => x.id !== c.id) })}><Trash2 size={13} /> Delete</button>
              </div>
              {providers.length === 0 && <p className="mt-2 text-[11px] text-white/30">Load providers to score auto-combo candidates.</p>}
            </FrostCard>
          );
        })
      )}
    </div>
  );
}

function ComboBuilder({ id, onBack }: { id: string; onBack: () => void }) {
  const { dash, providers, models } = useStore();
  const existing = dash.combos.find((c) => c.id === id);
  const [name, setName] = useState(existing?.name ?? "");
  const [strategy, setStrategy] = useState(existing?.strategy ?? "auto");
  const [steps, setSteps] = useState<ComboStep[]>(existing?.steps ?? [{ provider: "", model: "", connection: "default" }]);
  const [defaultTier, setDefaultTier] = useState<"cheap" | "flagship">(existing?.defaultTier ?? "cheap");
  const [fallbackTier, setFallbackTier] = useState<"cheap" | "flagship">(existing?.fallbackTier ?? "flagship");
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [err, setErr] = useState("");

  function setStep(i: number, patch: Partial<ComboStep>) {
    setSteps((s) => s.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  }

  function autoPool() {
    const scored = providers
      .filter((p) => p.enabled)
      .map((p) => ({
        p,
        score:
          (p.hasKey || p.authEnvVar.includes("keyless") ? 20 : 0) +
          (p.enabled ? 15 : 0) +
          Math.max(0, 20 - (p.errorRate ?? 0)) +
          Math.max(0, 15 - (p.avgLatency ?? 500) / 100),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    setSteps(
      scored.map((s) => ({
        provider: s.p.id,
        model: models.find((m) => m.providers.includes(s.p.id))?.id ?? "",
        connection: "default",
      })),
    );
    setStrategy("auto");
    setName(name || "Auto pool");
  }

  function save() {
    const tuples = steps.map((s) => `${s.provider}|${s.model}|${s.connection}`);
    if (new Set(tuples).size !== tuples.length) {
      setErr("Each step needs a unique provider + model + connection tuple.");
      return;
    }
    if (!name.trim() || steps.some((s) => !s.provider || !s.model)) {
      setErr("Name, provider and model are required on every step.");
      return;
    }
    const combo: Combo = {
      id: existing?.id ?? `cmb-${Date.now().toString(36)}`,
      name: name.trim(),
      strategy,
      steps,
      defaultTier,
      fallbackTier,
      enabled,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    const rest = dash.combos.filter((c) => c.id !== combo.id);
    saveDash({ combos: [combo, ...rest] });
    onBack();
  }

  const ready = useMemo(() => {
    const issues: string[] = [];
    if (!name.trim()) issues.push("name");
    if (steps.length < 1) issues.push("steps");
    if (steps.some((s) => !providers.find((p) => p.id === s.provider)?.enabled)) issues.push("disabled provider");
    return issues;
  }, [name, steps, providers]);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="frost-btn"><ArrowLeft size={14} /> Combos</button>
      <FrostCard variant="blue-bg" title={existing ? "Edit combo" : "Add combo"} subtitle="Step builder · provider → model → connection">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase text-white/40">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="frost-input" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase text-white/40">Strategy</span>
            <select value={strategy} onChange={(e) => setStrategy(e.target.value)} className="frost-input">
              {STRATEGIES.map((s) => (
                <option key={s.id} value={s.id} className="bg-black">{s.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="text-xs text-white/50">defaultTier
            <select value={defaultTier} onChange={(e) => setDefaultTier(e.target.value as "cheap" | "flagship")} className="frost-input mt-1">
              <option value="cheap">cheap</option>
              <option value="flagship">flagship</option>
            </select>
          </label>
          <label className="text-xs text-white/50">fallbackTier
            <select value={fallbackTier} onChange={(e) => setFallbackTier(e.target.value as "cheap" | "flagship")} className="frost-input mt-1">
              <option value="cheap">cheap</option>
              <option value="flagship">flagship</option>
            </select>
          </label>
          <Toggle checked={enabled} onChange={setEnabled} label="Enabled" />
        </div>
      </FrostCard>

      {steps.map((s, i) => (
        <FrostCard key={i} title={`Step ${i + 1}`} action={steps.length > 1 && <button className="frost-btn" onClick={() => setSteps((x) => x.filter((_, n) => n !== i))}><Trash2 size={13} /></button>}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select value={s.provider} onChange={(e) => setStep(i, { provider: e.target.value })} className="frost-input">
              <option value="">provider…</option>
              {providers.map((p) => <option key={p.id} value={p.id} className="bg-black">{p.name}</option>)}
            </select>
            <select value={s.model} onChange={(e) => setStep(i, { model: e.target.value })} className="frost-input">
              <option value="">model…</option>
              {models.filter((m) => !s.provider || m.providers.includes(s.provider)).map((m) => <option key={m.id} value={m.id} className="bg-black">{m.id}</option>)}
            </select>
            <input value={s.connection} onChange={(e) => setStep(i, { connection: e.target.value })} className="frost-input" placeholder="connection" />
          </div>
        </FrostCard>
      ))}

      <div className="flex flex-wrap gap-2">
        <button className="frost-btn" onClick={() => setSteps((s) => [...s, { provider: "", model: "", connection: `c${s.length + 1}` }])}><Plus size={13} /> Step</button>
        <button className="frost-btn" onClick={autoPool}><Sparkles size={13} /> Auto-combo pool</button>
        <button className="frost-btn frost-btn-frost" onClick={save}><CheckCircle2 size={13} /> Save combo</button>
      </div>
      {ready.length > 0 && <p className="text-xs text-orange-300">Readiness: {ready.join(", ")}</p>}
      {err && <p className="text-xs text-red-300">{err}</p>}
    </div>
  );
}

function comboHealth(c: Combo, reqs: { provider_id: string; error: string | null; latency_ms: number }[]) {
  const ids = new Set(c.steps.map((s) => s.provider));
  const subset = reqs.filter((r) => ids.has(r.provider_id));
  const n = subset.length || 1;
  const err = subset.filter((r) => r.error).length / n * 100;
  const lat = subset.length ? Math.round(subset.reduce((s, r) => s + r.latency_ms, 0) / subset.length) : 0;
  return {
    ready: c.steps.every((s) => s.provider && s.model) ? "ready" : "draft",
    err: `${err.toFixed(0)}%`,
    lat: `${lat}ms`,
  };
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.05] px-2 py-1.5">
      <p className="text-[9px] uppercase text-white/35">{label}</p>
      <p className="font-mono text-xs text-white/85">{value}</p>
    </div>
  );
}
