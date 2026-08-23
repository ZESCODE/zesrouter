import { useState } from "react";
import { FileCode, ShieldAlert, History, Power, PlayCircle, RotateCcw, CheckCircle2, Palette, Shield, Route, HeartPulse, Sliders, Globe } from "lucide-react";
import FrostCard from "../components/ui/FrostCard";
import Badge from "../components/ui/Badge";
import Toggle from "../components/ui/Toggle";
import { useStore, setDaemonRunning, reloadDaemon, saveSettings, getJSON } from "../lib/store";
import { localTime } from "../lib/format";
import { ACCENT_PRESETS, COMPRESSION_ENGINES } from "../lib/catalog";
import { applyAppearance } from "../lib/appearance";
import type { PageId } from "../lib/nav";
import type { DashSettings } from "../lib/types";

const TABS = [
  { id: "general", label: "General", icon: FileCode },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "security", label: "Security", icon: Shield },
  { id: "routing", label: "Routing", icon: Route },
  { id: "resilience", label: "Resilience", icon: HeartPulse },
  { id: "advanced", label: "Advanced", icon: Sliders },
  { id: "proxy", label: "Proxy", icon: Globe },
];

export default function SettingsPage({ parts, setPage }: { parts?: string[]; setPage?: (p: PageId, parts?: string[]) => void }) {
  const tab = parts?.[0] || "general";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setPage?.("settings", [t.id])} className={`frost-btn !min-h-11 ${tab === t.id ? "frost-btn-frost" : ""}`}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === "appearance" ? <AppearanceTab /> : tab === "security" ? <SecurityTab /> : tab === "routing" ? <RoutingTab /> : tab === "resilience" ? <ResilienceTab /> : tab === "advanced" ? <AdvancedTab /> : tab === "proxy" ? <ProxyTab /> : <GeneralTab />}
    </div>
  );
}

function useSettings() {
  const { dash } = useStore();
  const s = dash.settings;
  function patch(p: Partial<DashSettings> | ((prev: DashSettings) => DashSettings)) {
    const next = typeof p === "function" ? p(s) : { ...s, ...p };
    saveSettings(next);
  }
  return { s, patch };
}

function GeneralTab() {
  const { daemonRunning, config, backups } = useStore();
  const [yaml, setYaml] = useState<string | null>(config);
  const [cliOutput, setCliOutput] = useState<string | null>(null);
  const [busy, setBusy] = useState<"validate" | "save" | "restore" | "export" | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [confirmDanger, setConfirmDanger] = useState<"stop" | "start" | null>(null);
  if (config !== null && yaml === null) setYaml(config);

  async function api(path: string, body?: unknown) {
    return getJSON<Record<string, unknown>>(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  return (
    <>
      <FrostCard variant="blue-bg" title="System storage" subtitle="export / import dashboard + daemon config">
        <div className="flex flex-wrap gap-2">
          <button
            className="frost-btn frost-btn-frost"
            onClick={async () => {
              setBusy("export");
              const r = await api("/api/dash/export");
              const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `zesrouter-export-${Date.now()}.json`;
              a.click();
              setBusy(null);
            }}
          >
            Export database
          </button>
          <label className="frost-btn">
            Import
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const text = await f.text();
                await api("/api/dash/import", JSON.parse(text));
                location.reload();
              }}
            />
          </label>
        </div>
      </FrostCard>

      <FrostCard variant="orange" title="Config Editor" subtitle="/root/.bitrouter/bitrouter.yaml" icon={<FileCode size={16} />}>
        <textarea value={yaml ?? "Loading config…"} onChange={(e) => setYaml(e.target.value)} spellCheck={false} rows={14} className="frost-input min-h-64 font-mono text-xs" />
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={async () => { setBusy("validate"); const r = await api("/api/config/validate", { yaml }); setCliOutput(JSON.stringify(r, null, 2)); setBusy(null); }} disabled={busy !== null || yaml === null} className="frost-btn">
            <CheckCircle2 size={14} /> {busy === "validate" ? "Validating…" : "Validate"}
          </button>
          <button onClick={async () => { setBusy("save"); const r = await api("/api/config/save", { yaml, reload: true }); setCliOutput(JSON.stringify(r, null, 2)); setBusy(null); if (r.ok) reloadDaemon(); }} disabled={busy !== null || yaml === null} className="frost-btn frost-btn-frost">
            <RotateCcw size={14} /> {busy === "save" ? "Saving…" : "Save + Reload"}
          </button>
        </div>
        {cliOutput && <pre className="mt-3 overflow-x-auto rounded-lg bg-black/50 p-3 text-[11px] text-green-300/90">{cliOutput}</pre>}
      </FrostCard>

      <FrostCard title="Config Backups" icon={<History size={16} />}>
        {backups.length === 0 ? <p className="text-xs text-white/35">No backups found.</p> : backups.map((b) => (
          <div key={b.name} className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2">
            <div><p className="font-mono text-xs">{b.name}</p><p className="text-[10px] text-white/35">{localTime(b.mtime)}</p></div>
            {restoreTarget === b.name ? (
              <div className="flex gap-1.5">
                <button onClick={async () => { setBusy("restore"); await api("/api/backups/restore", { name: b.name }); setBusy(null); setRestoreTarget(null); reloadDaemon(); }} className="frost-btn frost-btn-frost">Confirm</button>
                <button onClick={() => setRestoreTarget(null)} className="frost-btn">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setRestoreTarget(b.name)} className="frost-btn">Restore</button>
            )}
          </div>
        ))}
      </FrostCard>

      <FrostCard variant="red" title="Danger Zone" icon={<ShieldAlert size={16} />}>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={daemonRunning ? "green" : "red"} dot>{daemonRunning ? "Daemon running" : "Daemon stopped"}</Badge>
          {confirmDanger ? (
            <>
              <button onClick={() => { setDaemonRunning(confirmDanger === "start"); setConfirmDanger(null); }} className="frost-btn frost-btn-destructive">Yes, {confirmDanger}</button>
              <button onClick={() => setConfirmDanger(null)} className="frost-btn">Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => setConfirmDanger("stop")} disabled={!daemonRunning} className="frost-btn frost-btn-destructive"><Power size={13} /> Stop</button>
              <button onClick={() => setConfirmDanger("start")} disabled={daemonRunning} className="frost-btn frost-btn-success"><PlayCircle size={13} /> Start</button>
            </>
          )}
        </div>
      </FrostCard>
    </>
  );
}

function AppearanceTab() {
  const { s, patch } = useSettings();
  const a = s.appearance;
  return (
    <FrostCard variant="blue-bg" title="Appearance" subtitle="theme · frost accent · chrome">
      <p className="mb-2 text-[11px] uppercase text-white/40">Theme</p>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(["dark", "light", "system"] as const).map((t) => (
          <button key={t} className={`frost-btn ${a.theme === t ? "frost-btn-frost" : ""}`} onClick={() => { const next = { ...a, theme: t }; patch({ appearance: next }); applyAppearance(next); }}>{t}</button>
        ))}
      </div>
      <p className="mb-2 text-[11px] uppercase text-white/40">7 preset colors + custom hex</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {ACCENT_PRESETS.map((p) => (
          <button key={p.id} onClick={() => { const next = { ...a, accent: p.id }; patch({ appearance: next }); applyAppearance(next); }} className="h-11 w-11 rounded-full border border-white/20" style={{ background: p.hex, boxShadow: a.accent === p.id ? `0 0 16px ${p.hex}` : undefined }} title={p.label} />
        ))}
      </div>
      <label className="text-xs text-white/50">Custom hex
        <input value={a.customHex} onChange={(e) => { const next = { ...a, accent: "custom", customHex: e.target.value }; patch({ appearance: next }); applyAppearance(next); }} className="frost-input mt-1" />
      </label>
      <div className="mt-4 space-y-2">
        <Toggle checked={a.showHealthLog} onChange={(v) => patch({ appearance: { ...a, showHealthLog: v } })} label="Show health log on dashboard" />
        <div className="flex flex-wrap gap-1.5">
          {(["auto", "visible", "hidden"] as const).map((v) => (
            <button key={v} className={`frost-btn ${a.sidebar === v ? "frost-btn-frost" : ""}`} onClick={() => { const next = { ...a, sidebar: v }; patch({ appearance: next }); applyAppearance(next); }}>sidebar {v}</button>
          ))}
        </div>
      </div>
    </FrostCard>
  );
}

function SecurityTab() {
  const { s, patch } = useSettings();
  const { health } = useStore();
  const sec = s.security;
  return (
    <FrostCard title="Security" subtitle="endpoint protection · IP filter · session">
      <Toggle checked={sec.protectEndpoint} onChange={(v) => patch({ security: { ...sec, protectEndpoint: v } })} label="Protect API endpoint (Bearer token)" />
      <label className="mt-3 block text-xs text-white/50">Blocked custom providers (comma)
        <input value={sec.blockedProviders.join(",")} onChange={(e) => patch({ security: { ...sec, blockedProviders: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } })} className="frost-input mt-1" />
      </label>
      <label className="mt-3 block text-xs text-white/50">IP allow list
        <input value={sec.ipAllow} onChange={(e) => patch({ security: { ...sec, ipAllow: e.target.value } })} className="frost-input mt-1" placeholder="127.0.0.1, 10.0.0.0/8" />
      </label>
      <label className="mt-3 block text-xs text-white/50">IP deny list
        <input value={sec.ipDeny} onChange={(e) => patch({ security: { ...sec, ipDeny: e.target.value } })} className="frost-input mt-1" />
      </label>
      <div className="mt-4 rounded-xl bg-white/[0.04] p-3 text-xs text-white/55">
        Session · daemon {health.status} · listen {health.listen} · last check {health.lastCheck}
      </div>
    </FrostCard>
  );
}

function RoutingTab() {
  const { s, patch } = useSettings();
  const [alias, setAlias] = useState("");
  const [target, setTarget] = useState("");
  return (
    <FrostCard title="Routing" subtitle="model aliases · background degradation">
      <Toggle checked={s.degradeBackground} onChange={(v) => patch({ degradeBackground: v })} label="Degrade background tasks to cheap tier" />
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="alias" className="frost-input" />
        <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="target model" className="frost-input" />
      </div>
      <button className="frost-btn frost-btn-frost mt-2" onClick={() => { if (!alias.trim() || !target.trim()) return; patch({ aliases: { ...s.aliases, [alias.trim()]: target.trim() } }); setAlias(""); setTarget(""); }}>Add alias</button>
      <div className="mt-3 space-y-1">
        {Object.entries(s.aliases).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-xs">
            <span className="font-mono">{k} → {v}</span>
            <button className="frost-btn" onClick={() => { const n = { ...s.aliases }; delete n[k]; patch({ aliases: n }); }}>remove</button>
          </div>
        ))}
      </div>
    </FrostCard>
  );
}

function ResilienceTab() {
  const { s, patch } = useSettings();
  const r = s.resilience;
  return (
    <FrostCard title="Resilience" subtitle="circuit breaker · rate limits · context relay">
      <Toggle checked={r.persistRateLimits} onChange={(v) => patch({ resilience: { ...r, persistRateLimits: v } })} label="Persist rate limits across restarts" />
      <Toggle checked={r.autoDisableBanned} onChange={(v) => patch({ resilience: { ...r, autoDisableBanned: v } })} label="Auto-disable banned accounts" />
      <Toggle checked={r.watchExpiration} onChange={(v) => patch({ resilience: { ...r, watchExpiration: v } })} label="Watch provider expiration" />
      <label className="mt-3 block text-xs text-white/50">Circuit breaker failures
        <input type="number" value={r.cbFailures} onChange={(e) => patch({ resilience: { ...r, cbFailures: Number(e.target.value) } })} className="frost-input mt-1" />
      </label>
      <label className="mt-3 block text-xs text-white/50">Cooldown seconds
        <input type="number" value={r.cbCooldownSec} onChange={(e) => patch({ resilience: { ...r, cbCooldownSec: Number(e.target.value) } })} className="frost-input mt-1" />
      </label>
      <label className="mt-3 block text-xs text-white/50">Context Relay threshold %
        <input type="number" value={r.relayThreshold} onChange={(e) => patch({ resilience: { ...r, relayThreshold: Number(e.target.value) } })} className="frost-input mt-1" />
      </label>
    </FrostCard>
  );
}

function AdvancedTab() {
  const { s, patch } = useSettings();
  const { logs } = useStore();
  return (
    <FrostCard title="Advanced" subtitle="overrides · audit · fallback degrade">
      <Toggle checked={s.fallbackDegrade} onChange={(v) => patch({ fallbackDegrade: v })} label="Fallback degradation mode" />
      <Toggle checked={s.auditEnabled} onChange={(v) => patch({ auditEnabled: v })} label="Audit trail" />
      <label className="mt-3 block text-xs text-white/50">Default compression
        <select value={s.compressionDefault} onChange={(e) => patch({ compressionDefault: e.target.value })} className="frost-input mt-1">
          {COMPRESSION_ENGINES.map((e) => <option key={e.id} value={e.id} className="bg-black">{e.name}</option>)}
        </select>
      </label>
      <label className="mt-3 block text-xs text-white/50">Compression level (1–3)
        <input type="number" min={1} max={3} value={s.compressionLevel} onChange={(e) => patch({ compressionLevel: Number(e.target.value) })} className="frost-input mt-1" />
      </label>
      {s.auditEnabled && (
        <div className="mt-4 max-h-48 overflow-auto rounded-lg bg-black/40 p-2 font-mono text-[10px] text-white/45">
          {logs.slice(-20).map((l, i) => <div key={i}>{l.ts} {l.level} {l.msg}</div>)}
        </div>
      )}
    </FrostCard>
  );
}

function ProxyTab() {
  const { s, patch } = useSettings();
  return (
    <FrostCard title="Proxy" subtitle="enforcement · token health · OAuth refresh">
      <Toggle checked={s.proxyEnforce} onChange={(v) => patch({ proxyEnforce: v })} label="Enforce proxy for upstream" />
      <label className="mt-3 block text-xs text-white/50">Proxy URL
        <input value={s.proxyUrl} onChange={(e) => patch({ proxyUrl: e.target.value })} className="frost-input mt-1" placeholder="http://127.0.0.1:7890" />
      </label>
      <Toggle checked={s.tokenHealthCheck} onChange={(v) => patch({ tokenHealthCheck: v })} label="Token health check" />
      <Toggle checked={s.oauthRefresh} onChange={(v) => patch({ oauthRefresh: v })} label="OAuth refresh" />
    </FrostCard>
  );
}
