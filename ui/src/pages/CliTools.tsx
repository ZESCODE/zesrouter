import { useState } from "react";
import { Terminal, Webhook, Copy, Check } from "lucide-react";
import FrostCard from "../components/ui/FrostCard";
import Badge from "../components/ui/Badge";
import Toggle from "../components/ui/Toggle";
import EmptyState from "../components/ui/EmptyState";
import { CLI_TOOLS } from "../lib/catalog";
import { useStore, saveDash, applyCliTool } from "../lib/store";

export default function CliTools() {
  const { dash, models } = useStore();
  const [preview, setPreview] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  const [whName, setWhName] = useState("");
  const [whUrl, setWhUrl] = useState("");

  async function run(id: string, action: "apply" | "reset") {
    setBusy(id);
    const r = await applyCliTool(id, action);
    setPreview((p) => ({ ...p, [id]: r.preview ?? r.message ?? r.error ?? "" }));
    setBusy(null);
  }

  function copy(text: string, id: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(""), 1200);
  }

  return (
    <div className="space-y-4">
      <FrostCard variant="blue-bg" title="CLI one-click" subtitle="Point agents at http://localhost:4356/v1" icon={<Terminal size={16} />}>
        <p className="text-xs text-white/45">Applies a ZESRouter connection profile + model mapping. Reset restores the previous snippet if we wrote it.</p>
      </FrostCard>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {CLI_TOOLS.map((t) => (
          <FrostCard key={t.id} title={t.name} subtitle={t.file}>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy === t.id} onClick={() => run(t.id, "apply")} className="frost-btn frost-btn-frost">Apply</button>
              <button disabled={busy === t.id} onClick={() => run(t.id, "reset")} className="frost-btn">Reset</button>
              {preview[t.id] && (
                <button className="frost-btn" onClick={() => copy(preview[t.id], t.id)}>
                  {copied === t.id ? <Check size={13} /> : <Copy size={13} />} Copy
                </button>
              )}
            </div>
            {preview[t.id] && <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-black/40 p-2 font-mono text-[10px] text-blue-100/80">{preview[t.id]}</pre>}
          </FrostCard>
        ))}
      </div>

      <FrostCard title="Webhooks" subtitle="POST JSON on request / error / failover" icon={<Webhook size={16} />}>
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input value={whName} onChange={(e) => setWhName(e.target.value)} placeholder="name" className="frost-input" />
          <input value={whUrl} onChange={(e) => setWhUrl(e.target.value)} placeholder="https://example.com/hook" className="frost-input" />
        </div>
        <button
          className="frost-btn frost-btn-frost"
          onClick={() => {
            if (!whName.trim() || !whUrl.trim()) return;
            saveDash({ webhooks: [{ id: `wh-${Date.now().toString(36)}`, name: whName.trim(), url: whUrl.trim(), events: ["error", "failover"], enabled: true }, ...dash.webhooks] });
            setWhName("");
            setWhUrl("");
          }}
        >
          Add webhook
        </button>
        <div className="mt-4 space-y-2">
          {dash.webhooks.length === 0 && <EmptyState text="No webhooks configured." />}
          {dash.webhooks.map((w) => (
            <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div>
                <p className="text-sm text-white/85">{w.name}</p>
                <p className="font-mono text-[11px] text-white/40">{w.url}</p>
                <div className="mt-1 flex gap-1">{w.events.map((e) => <Badge key={e}>{e}</Badge>)}</div>
              </div>
              <div className="flex items-center gap-2">
                <Toggle checked={w.enabled} onChange={(v) => saveDash({ webhooks: dash.webhooks.map((x) => x.id === w.id ? { ...x, enabled: v } : x) })} />
                <button className="frost-btn frost-btn-destructive" onClick={() => saveDash({ webhooks: dash.webhooks.filter((x) => x.id !== w.id) })}>Remove</button>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-white/35">Mapped models: {models.slice(0, 4).map((m) => m.id).join(", ") || "loading…"}</p>
      </FrostCard>
    </div>
  );
}
