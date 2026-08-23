import { useMemo, useState } from "react";
import { KeyRound, KeySquare, Server, Save, Trash2, RefreshCw, FlaskConical, Plus, X, Shield, Wrench, Eye, EyeOff, Search, ArrowLeft } from "lucide-react";
import FrostCard from "../components/ui/FrostCard";
import Badge from "../components/ui/Badge";
import Toggle from "../components/ui/Toggle";
import EmptyState from "../components/ui/EmptyState";
import { useStore, setProviderKey, restartDaemon, testProvider, addProvider, removeProvider, repairOAuth, saveDash } from "../lib/store";
import { avgLatency, costSum, errorRate, withinHours } from "../lib/stats";
import { usd } from "../lib/format";
import { CATALOG_PROVIDERS, KIND_LABEL, type ProviderKind, maskEmail } from "../lib/catalog";
import type { PageId } from "../lib/nav";

export default function Providers({ parts, setPage }: { parts: string[]; setPage: (p: PageId, parts?: string[]) => void }) {
  const action = parts[0];
  const pid = parts[0] && parts[0] !== "add" ? parts[0] : "";
  const sub = parts[1];

  if (action === "add") return <AddWizard onBack={() => setPage("providers")} />;
  if (pid && sub === "models") return <ProviderModels pid={pid} onBack={() => setPage("providers", [pid])} />;
  if (pid) return <ProviderDetail pid={pid} setPage={setPage} />;
  return <ProviderList setPage={setPage} />;
}

function ProviderList({ setPage }: { setPage: (p: PageId, parts?: string[]) => void }) {
  const { requests, providers, dash, omniroute } = useStore();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | ProviderKind>("all");
  const last24h = withinHours(requests, 24);

  const rows = providers.map((p) => {
    const reqs = last24h.filter((r) => r.provider_id === p.id);
    const cat = CATALOG_PROVIDERS.find((c) => c.id === p.id || p.id.includes(c.id));
    const models = (cat?.models ?? []).filter((m) => !(dash.hiddenModels[p.id] ?? []).includes(m));
    const totalModels = cat?.models.length ?? 0;
    const cb = omniroute.circuit_breakers.find((c) => c.provider_id === p.id);
    return {
      ...p,
      count: reqs.length,
      success: reqs.filter((r) => !r.error).length,
      errors: reqs.filter((r) => r.error).length,
      rate: errorRate(reqs),
      latency: avgLatency(reqs),
      cost: costSum(reqs),
      kind: inferKind(p.id, p.authEnvVar),
      activeModels: models.length,
      totalModels,
      cb: cb?.state ?? "closed",
      email: cat?.email,
      credits: cat?.credits,
    };
  }).sort((a, b) => b.rate - a.rate);

  const filtered = rows.filter((p) => {
    if (kind !== "all" && p.kind !== kind) return false;
    const s = q.toLowerCase();
    return !s || p.id.includes(s) || p.name.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <FrostCard variant="blue-bg" title="Provider ecosystem" subtitle={`${providers.length} configured · OAuth / API key / free`} icon={<Server size={16} />}
        action={<button onClick={() => setPage("providers", ["add"])} className="frost-btn frost-btn-frost !min-h-11"><Plus size={14} /> Add</button>}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-3.5 text-white/30" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search providers…" className="frost-input pl-9" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["all", "oauth", "free-noauth", "apikey", "free"] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={`frost-btn !min-h-11 ${kind === k ? "frost-btn-frost" : ""}`}>
                {k === "all" ? "All" : KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
      </FrostCard>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => {
          const isHot = p.rate > 20;
          return (
            <FrostCard
              key={p.id}
              variant={p.cb === "open" ? "red" : isHot ? "orange" : "blue"}
              title={p.name}
              subtitle={p.apiBase || p.id}
              icon={<Server size={16} />}
              action={
                <div className="flex items-center gap-1.5">
                  <Badge variant={p.enabled ? "green" : "neutral"} dot>{p.enabled ? "on" : "off"}</Badge>
                  <Badge variant={p.cb === "closed" ? "green" : p.cb === "half-open" ? "orange" : "red"}>{p.cb}</Badge>
                </div>
              }
            >
              <button onClick={() => setPage("providers", [p.id])} className="mb-3 block w-full text-left">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <Badge>{KIND_LABEL[p.kind]}</Badge>
                  {p.totalModels > 0 && <Badge variant="cyan">{p.activeModels}/{p.totalModels} active</Badge>}
                  {p.email && <Badge variant="neutral">{maskEmail(p.email)}</Badge>}
                  {p.credits != null && <Badge variant="orange">{p.credits} cr</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <MiniStat label="Reqs" value={String(p.count)} />
                  <MiniStat label="Errors" value={String(p.errors)} accent={p.errors > 0 ? "text-red-400" : undefined} />
                  <MiniStat label="Lat" value={`${p.latency}ms`} />
                  <MiniStat label="Cost" value={usd(p.cost)} />
                </div>
              </button>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setPage("providers", [p.id, "models"])} className="frost-btn !min-h-11 !px-3">Models</button>
                <button onClick={() => setPage("providers", [p.id])} className="frost-btn frost-btn-frost !min-h-11 !px-3">Open</button>
              </div>
            </FrostCard>
          );
        })}
      </div>
      {filtered.length === 0 && <EmptyState text="No providers match this filter." />}
    </div>
  );
}

function ProviderDetail({ pid, setPage }: { pid: string; setPage: (p: PageId, parts?: string[]) => void }) {
  const { providers, requests, dash, omniroute } = useStore();
  const p = providers.find((x) => x.id === pid);
  const cat = CATALOG_PROVIDERS.find((c) => c.id === pid || pid.includes(c.id));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testText, setTestText] = useState("");
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const last24h = withinHours(requests, 24).filter((r) => r.provider_id === pid);
  const cb = omniroute.circuit_breakers.find((c) => c.provider_id === pid);

  if (!p) {
    return (
      <FrostCard title="Provider not found">
        <EmptyState text={`No provider '${pid}'.`} />
        <button onClick={() => setPage("providers")} className="frost-btn frost-btn-frost mt-3"><ArrowLeft size={14} /> Back</button>
      </FrostCard>
    );
  }

  const keyless = p.authEnvVar === "none" || p.authEnvVar === "none (keyless)";
  const kind = inferKind(p.id, p.authEnvVar);

  async function saveKey() {
    setBusy(true);
    const r = await setProviderKey(pid, draft.trim() || null);
    setNotice({ kind: r.ok ? "ok" : "err", text: r.message ?? r.error ?? "" });
    setBusy(false);
    if (r.ok) restartDaemon();
  }

  return (
    <div className="space-y-4">
      <button onClick={() => setPage("providers")} className="frost-btn"><ArrowLeft size={14} /> All providers</button>
      <FrostCard variant="blue-bg" title={p.name} subtitle={p.apiBase || p.id} icon={<Server size={16} />}
        action={<Badge variant={p.enabled ? "green" : "neutral"} dot>{p.enabled ? "enabled" : "disabled"}</Badge>}
      >
        <div className="flex flex-wrap gap-1.5">
          <Badge>{KIND_LABEL[kind]}</Badge>
          <Badge variant={cb?.state === "closed" ? "green" : cb?.state === "half-open" ? "orange" : "red"}>{cb?.state ?? "closed"}</Badge>
          {cat?.email && <Badge variant="neutral">{maskEmail(cat.email)}</Badge>}
          {cat?.credits != null && <Badge variant="orange">{cat.credits} credits</Badge>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="Reqs 24h" value={String(last24h.length)} />
          <MiniStat label="Errors" value={String(last24h.filter((r) => r.error).length)} />
          <MiniStat label="Latency" value={`${avgLatency(last24h)}ms`} />
          <MiniStat label="Cost" value={usd(costSum(last24h))} />
        </div>
      </FrostCard>

      <FrostCard title="Credentials" subtitle="TTL-cached health · never echoed back" icon={<KeyRound size={16} />}>
        <div className="mb-3 flex items-center gap-2 text-xs text-white/50">
          {keyless ? <KeySquare size={13} className="text-cyan-400" /> : p.hasKey ? <KeyRound size={13} className="text-green-400" /> : <KeySquare size={13} className="text-red-400" />}
          <span className="font-mono">{p.authEnvVar}</span>
          <Badge variant={keyless ? "cyan" : p.hasKey ? "green" : "red"}>{keyless ? "keyless" : p.hasKey ? "healthy" : "missing"}</Badge>
        </div>
        {!keyless && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input type="password" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={p.hasKey ? "••••  replace key" : "paste API key"} className="frost-input" />
            <button onClick={saveKey} disabled={busy || !draft.trim()} className="frost-btn frost-btn-frost"><Save size={13} /> Save</button>
            {p.hasKey && <button onClick={async () => { setBusy(true); await setProviderKey(pid, null); setBusy(false); }} className="frost-btn frost-btn-destructive"><Trash2 size={13} /> Clear</button>}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={async () => { setTesting(true); const r = await testProvider(pid); setTestText(r.ok ? `OK ${r.model} ${r.latencyMs}ms` : `FAIL ${r.detail ?? ""}`); setTesting(false); }} className="frost-btn">
            {testing ? <RefreshCw size={13} className="animate-spin" /> : <FlaskConical size={13} />} Test
          </button>
          {kind === "oauth" && (
            <button onClick={async () => { const r = await repairOAuth(pid); setNotice({ kind: r.ok ? "ok" : "err", text: r.message ?? r.error ?? "" }); }} className="frost-btn frost-btn-frost">
              <Wrench size={13} /> Repair env
            </button>
          )}
          <button onClick={() => setPage("providers", [pid, "models"])} className="frost-btn"><Eye size={13} /> Models</button>
        </div>
        {testText && <p className="mt-2 font-mono text-[11px] text-blue-200">{testText}</p>}
        {notice && <p className={`mt-2 text-xs ${notice.kind === "ok" ? "text-green-300" : "text-red-300"}`}>{notice.text}</p>}
      </FrostCard>

      <FrostCard variant="orange" title="Cooldown & lockout" icon={<Shield size={16} />}>
        <p className="mb-2 text-xs text-white/45">Cooldown until: {dash.cooldown[pid] || "none"} · locked models: {(dash.lockout[pid] ?? []).join(", ") || "none"}</p>
        <div className="flex flex-wrap gap-2">
          <button className="frost-btn" onClick={() => saveDash({ cooldown: { ...dash.cooldown, [pid]: new Date(Date.now() + 30_000).toISOString() } })}>Cool 30s</button>
          <button className="frost-btn" onClick={() => saveDash({ cooldown: { ...dash.cooldown, [pid]: "" } })}>Clear cooldown</button>
        </div>
      </FrostCard>

      <FrostCard variant="red" title="Danger" icon={<Trash2 size={16} />}>
        {removeConfirm ? (
          <div className="flex gap-2">
            <button className="frost-btn frost-btn-destructive" onClick={async () => { await removeProvider(pid); setPage("providers"); }}>Confirm remove</button>
            <button className="frost-btn" onClick={() => setRemoveConfirm(false)}>Cancel</button>
          </div>
        ) : (
          <button className="frost-btn frost-btn-destructive" onClick={() => setRemoveConfirm(true)}><Trash2 size={13} /> Remove provider</button>
        )}
      </FrostCard>
    </div>
  );
}

function ProviderModels({ pid, onBack }: { pid: string; onBack: () => void }) {
  const { models, dash } = useStore();
  const [q, setQ] = useState("");
  const cat = CATALOG_PROVIDERS.find((c) => c.id === pid || pid.includes(c.id));
  const all = useMemo(() => {
    const fromRoute = models.filter((m) => m.providers.includes(pid)).map((m) => m.id);
    const extra = cat?.models ?? [];
    return Array.from(new Set([...fromRoute, ...extra]));
  }, [models, cat, pid]);
  const hidden = new Set(dash.hiddenModels[pid] ?? []);
  const shown = all.filter((m) => m.toLowerCase().includes(q.toLowerCase()));
  const active = all.filter((m) => !hidden.has(m)).length;

  function toggle(id: string) {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    saveDash({ hiddenModels: { ...dash.hiddenModels, [pid]: [...next] } });
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="frost-btn"><ArrowLeft size={14} /> Back</button>
      <FrostCard title={`${pid} models`} subtitle={`${active}/${all.length} visible in /v1/models`} icon={<Eye size={16} />}
        action={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter…" className="frost-input !min-h-10 w-36" />}
      >
        <div className="space-y-2">
          {shown.map((m) => (
            <div key={m} className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <span className="truncate font-mono text-xs text-white/80">{m}</span>
              <button onClick={() => toggle(m)} className="frost-btn !min-h-10 !px-3">
                {hidden.has(m) ? <><EyeOff size={13} /> Hidden</> : <><Eye size={13} /> Visible</>}
              </button>
            </div>
          ))}
          {shown.length === 0 && <EmptyState text="No models for this provider." />}
        </div>
      </FrostCard>
    </div>
  );
}

function AddWizard({ onBack }: { onBack: () => void }) {
  const [id, setId] = useState("");
  const [display, setDisplay] = useState("");
  const [api, setApi] = useState("");
  const [auth, setAuth] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [preset, setPreset] = useState("");

  function applyPreset(pid: string) {
    const c = CATALOG_PROVIDERS.find((x) => x.id === pid);
    if (!c) return;
    setPreset(pid);
    setId(c.id);
    setDisplay(c.name);
    setAuth(c.env ?? "none");
  }

  async function submit() {
    setBusy(true);
    const r = await addProvider({ id: id.trim(), displayName: display.trim(), apiBase: api.trim(), authEnv: auth.trim() || "none", enabled });
    setNotice(r.message ?? r.error ?? "");
    setBusy(false);
    if (r.ok) setTimeout(onBack, 700);
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="frost-btn"><X size={14} /> Cancel</button>
      <FrostCard variant="blue-bg" title="Add provider" subtitle="Connection wizard · catalog presets or custom" icon={<Plus size={16} />}>
        <p className="mb-2 text-[11px] uppercase tracking-wide text-white/40">Presets</p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {CATALOG_PROVIDERS.map((c) => (
            <button key={c.id} onClick={() => applyPreset(c.id)} className={`frost-btn !min-h-11 ${preset === c.id ? "frost-btn-frost" : ""}`}>
              {c.name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Provider ID *"><input value={id} onChange={(e) => setId(e.target.value)} className="frost-input" placeholder="my-provider" /></Field>
          <Field label="Display name"><input value={display} onChange={(e) => setDisplay(e.target.value)} className="frost-input" /></Field>
          <Field label="API base URL" wide><input value={api} onChange={(e) => setApi(e.target.value)} className="frost-input" placeholder="https://api.example.com/v1" /></Field>
          <Field label="Auth env"><input value={auth} onChange={(e) => setAuth(e.target.value)} className="frost-input" placeholder="MY_API_KEY or none" /></Field>
          <div className="flex items-center"><Toggle checked={enabled} onChange={setEnabled} label="Enabled" /></div>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={submit} disabled={busy || !id.trim()} className="frost-btn frost-btn-frost">{busy ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />} Add provider</button>
          {notice && <span className="self-center text-xs text-blue-200">{notice}</span>}
        </div>
      </FrostCard>
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-[10px] uppercase tracking-wide text-white/40">{label}</span>
      {children}
    </label>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.05] px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-white/35">{label}</p>
      <p className={`font-mono text-xs font-semibold ${accent ?? "text-white/85"}`}>{value}</p>
    </div>
  );
}

function inferKind(id: string, env: string): ProviderKind {
  const cat = CATALOG_PROVIDERS.find((c) => c.id === id || id.includes(c.id));
  if (cat) return cat.kind;
  if (env === "none" || env.includes("keyless")) return "free-noauth";
  if (["claude", "codex", "gemini", "qoder"].some((x) => id.includes(x))) return "oauth";
  return "apikey";
}
