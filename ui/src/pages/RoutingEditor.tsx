import { useState } from "react";
import { Plus, Trash2, Save, CheckCircle2, AlertTriangle, Sliders, FileText, RefreshCw } from "lucide-react";
import GlassCard from "../components/ui/GlassCard";
import Badge from "../components/ui/Badge";
import { useStore } from "../lib/store";
import { EmptyState } from "./Dashboard";

const BLOCK_KEY = /^ {2}\S/;
const ANY_COL0 = /^\S/;

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findModelsIndex(lines: string[]): number {
  return lines.findIndex((l) => /^models:/.test(l));
}

function findBlockEnd(lines: string[], start: number): number {
  for (let i = start + 1; i < lines.length; i++) {
    if (ANY_COL0.test(lines[i])) return i;
  }
  return lines.length;
}

function insertModelBlock(yaml: string, modelId: string, provider: string, serviceId: string): string {
  const lines = yaml.split("\n");
  const mi = findModelsIndex(lines);
  if (mi === -1) return yaml;
  const end = findBlockEnd(lines, mi);
  const block = [
    `  ${modelId}:`,
    "    endpoints:",
    `      - provider: ${provider}`,
    `        service_id: ${serviceId}`,
  ];
  return [...lines.slice(0, end), ...block, ...lines.slice(end)].join("\n");
}

function removeModelBlock(yaml: string, modelId: string): string {
  const lines = yaml.split("\n");
  const re = new RegExp(`^  ${escapeReg(modelId)}:`);
  const start = lines.findIndex((l) => re.test(l));
  if (start === -1) return yaml;
  let end = start + 1;
  while (end < lines.length && !BLOCK_KEY.test(lines[end]) && !ANY_COL0.test(lines[end])) end++;
  return [...lines.slice(0, start), ...lines.slice(end)].join("\n");
}

function hasModelLine(yaml: string, modelId: string): boolean {
  return new RegExp(`^  ${escapeReg(modelId)}:`).test(yaml);
}

function slugOk(v: string): boolean {
  return v.length > 0 && !/[\s:]/.test(v);
}

function sanityOk(yaml: string): boolean {
  return yaml.trim().length > 0 && yaml.includes("models:");
}

type Status = { kind: "ok" | "err"; text: string } | null;

export default function RoutingEditor() {
  const { config, providers, models } = useStore();
  const [yaml, setYaml] = useState<string | null>(config);
  const [modelId, setModelId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [removeTarget, setRemoveTarget] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState<"validate" | "save" | null>(null);
  const [status, setStatus] = useState<Status>(null);

  if (config !== null && yaml === null) setYaml(config);

  function addError(text: string) {
    setStatus({ kind: "err", text });
  }

  function stageAdd(e: React.FormEvent) {
    e.preventDefault();
    const mid = modelId.trim();
    const pid = providerId.trim();
    const sid = serviceId.trim();
    if (!slugOk(mid) || !slugOk(pid) || !slugOk(sid)) {
      addError("Model, provider and service ids must be non-empty slugs — no whitespace or ':' allowed.");
      return;
    }
    if (yaml === null) return;
    if (hasModelLine(yaml, mid)) {
      addError(`Route "${mid}" already exists in the YAML.`);
      return;
    }
    setYaml(insertModelBlock(yaml, mid, pid, sid));
    setModelId("");
    setProviderId("");
    setServiceId("");
    setConfirmRemove(false);
    setStatus({ kind: "ok", text: `Route "${mid}" staged in the YAML — not saved yet.` });
  }

  function stageRemove() {
    if (yaml === null || !removeTarget) return;
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setYaml(removeModelBlock(yaml, removeTarget));
    setConfirmRemove(false);
    setStatus({ kind: "ok", text: `Route "${removeTarget}" removed from the YAML — not saved yet.` });
    setRemoveTarget("");
  }

  function resetFromStore() {
    if (config !== null) setYaml(config);
    setConfirmRemove(false);
    setStatus({ kind: "ok", text: "Discarded local edits — textarea reloaded from disk config." });
  }

  async function doValidate() {
    if (yaml === null) return;
    if (!sanityOk(yaml)) {
      addError("Draft is not valid: must be non-empty and contain a top-level 'models:' key.");
      return;
    }
    setBusy("validate");
    setStatus(null);
    try {
      const r = await fetch("/api/config/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; output?: string; error?: string; message?: string };
      const msg = String(j.output ?? j.error ?? j.message ?? JSON.stringify(j));
      setStatus({ kind: j.ok === false || !r.ok ? "err" : "ok", text: msg });
    } catch (e) {
      setStatus({ kind: "err", text: String(e) });
    }
    setBusy(null);
  }

  async function saveAndReload() {
    if (yaml === null) return;
    if (!sanityOk(yaml)) {
      addError("Draft is not valid: must be non-empty and contain a top-level 'models:' key.");
      return;
    }
    setBusy("save");
    setStatus(null);
    try {
      const r = await fetch("/api/config/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml, reload: true }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; output?: string; error?: string; message?: string };
      const msg = String(j.output ?? j.error ?? j.message ?? JSON.stringify(j));
      setStatus({ kind: j.ok === false || !r.ok ? "err" : "ok", text: j.ok === false || !r.ok ? msg : `Saved — daemon reloaded. ${msg}` });
    } catch (e) {
      setStatus({ kind: "err", text: String(e) });
    }
    setBusy(null);
  }

  const inputCls =
    "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/90 placeholder:text-white/25 focus:border-blue-400/50 focus:outline-none";
  const labelCls = "mb-1 block text-[10px] uppercase tracking-wide text-white/35";
  const btnCls =
    "flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium active:scale-95 disabled:opacity-50 disabled:active:scale-100";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-purple-300">
          <Sliders size={16} />
        </span>
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-white/90">Routing Editor</h2>
          <p className="text-[11px] text-white/40">Edit the models: section of bitrouter.yaml — edits stage in the YAML textarea until you save.</p>
        </div>
        <Badge variant="purple" className="ml-auto">
          {models.length} routes
        </Badge>
      </div>

      <GlassCard
        variant="purple"
        title="Add route"
        subtitle="Stages a new model block into the YAML — does not save"
        icon={<Plus size={16} />}
      >
        <form onSubmit={stageAdd} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls} htmlFor="re-model">Model ID</label>
            <input
              id="re-model"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="anthropic/claude-sonnet-5"
              spellCheck={false}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="re-provider">Provider</label>
            <input
              id="re-provider"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              placeholder="nvidia"
              spellCheck={false}
              list="re-provider-list"
              className={inputCls}
            />
            <datalist id="re-provider-list">
              {providers.map((p) => (
                <option key={p.id} value={p.id} />
              ))}
            </datalist>
          </div>
          <div>
            <label className={labelCls} htmlFor="re-service">Upstream service ID</label>
            <input
              id="re-service"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              placeholder="claude-sonnet-5"
              spellCheck={false}
              className={inputCls}
            />
          </div>
          <button
            type="submit"
            disabled={busy !== null || yaml === null}
            className={`${btnCls} justify-center border-purple-400/30 bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 sm:col-span-3`}
          >
            <Plus size={14} />
            Add route
          </button>
        </form>
      </GlassCard>

      <GlassCard
        variant="orange"
        title="Remove route"
        subtitle="Deletes the whole model block from the YAML — does not save"
        icon={<Trash2 size={16} />}
      >
        {models.length === 0 ? (
          <EmptyState text="No model routes configured yet." />
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <label className={labelCls} htmlFor="re-remove">Model route</label>
              <select
                id="re-remove"
                value={removeTarget}
                onChange={(e) => {
                  setRemoveTarget(e.target.value);
                  setConfirmRemove(false);
                }}
                className={inputCls}
              >
                <option value="" disabled>
                  Select a model…
                </option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={stageRemove}
              disabled={busy !== null || yaml === null || !removeTarget}
              className={`${btnCls} border-orange-400/30 bg-orange-500/15 text-orange-300 hover:bg-orange-500/25`}
            >
              <Trash2 size={14} />
              {confirmRemove ? "Confirm?" : "Remove"}
            </button>
          </div>
        )}
      </GlassCard>

      <GlassCard
        variant="blue"
        title="YAML"
        subtitle="Full bitrouter.yaml — the models: section is managed by the helpers above"
        icon={<FileText size={16} />}
        action={
          <button
            onClick={resetFromStore}
            disabled={config === null}
            title="Reload textarea from disk config"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-white/60 hover:bg-white/10 active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={12} />
            Reload
          </button>
        }
      >
        <textarea
          value={yaml ?? "Loading config…"}
          onChange={(e) => {
            setYaml(e.target.value);
            setConfirmRemove(false);
          }}
          spellCheck={false}
          className="h-72 w-full resize-y rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs leading-relaxed text-green-300/90 focus:border-blue-400/50 focus:outline-none"
        />
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-orange-300/80">
          <AlertTriangle size={12} />
          Saving reloads the daemon — expect a brief blip in live traffic.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={doValidate}
            disabled={busy !== null || yaml === null}
            className={`${btnCls} border-green-400/30 bg-green-500/15 text-green-300 hover:bg-green-500/25`}
          >
            <CheckCircle2 size={14} />
            {busy === "validate" ? "Validating…" : "Validate"}
          </button>
          <button
            onClick={saveAndReload}
            disabled={busy !== null || yaml === null}
            className={`${btnCls} border-blue-400/30 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25`}
          >
            <Save size={14} />
            {busy === "save" ? "Saving…" : "Save & Reload"}
          </button>
          {status && (
            <span className={`text-xs ${status.kind === "ok" ? "text-green-300/90" : "text-red-300/90"}`}>{status.text}</span>
          )}
        </div>
      </GlassCard>
    </div>
  );
}