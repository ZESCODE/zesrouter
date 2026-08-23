import FrostCard from "../components/ui/FrostCard";
import Toggle from "../components/ui/Toggle";
import { useStore, saveDash } from "../lib/store";
import { Shuffle } from "lucide-react";

export default function ContextRelay() {
  const { dash, models } = useStore();
  const c = dash.context;
  function patch(p: Partial<typeof c>) {
    saveDash({ context: { ...c, ...p } });
  }
  return (
    <div className="space-y-4">
      <FrostCard variant="blue-bg" title="Context Relay" subtitle="Session continuity when an account rotates" icon={<Shuffle size={16} />}
        action={<Toggle checked={c.enabled} onChange={(v) => patch({ enabled: v })} label={c.enabled ? "on" : "off"} />}
      >
        <p className="text-xs leading-relaxed text-white/50">
          When quota on the active connection crosses the handoff threshold, ZESRouter summarizes the last N messages and injects a structured handoff as a system message so the next account continues the thread.
        </p>
      </FrostCard>

      <FrostCard title="Handoff threshold" subtitle="default 85% quota usage">
        <input type="range" min={50} max={99} value={c.handoffThreshold} onChange={(e) => patch({ handoffThreshold: Number(e.target.value) })} className="w-full" />
        <p className="mt-2 text-sm text-blue-200">{c.handoffThreshold}%</p>
      </FrostCard>

      <FrostCard title="Summary window">
        <label className="text-xs text-white/50">Max messages
          <input type="number" min={4} max={200} value={c.maxMessages} onChange={(e) => patch({ maxMessages: Number(e.target.value) })} className="frost-input mt-1" />
        </label>
        <label className="mt-3 block text-xs text-white/50">Summary model override
          <select value={c.summaryModel} onChange={(e) => patch({ summaryModel: e.target.value })} className="frost-input mt-1">
            <option value="">(use cheap tier)</option>
            {models.map((m) => <option key={m.id} value={m.id} className="bg-black">{m.id}</option>)}
          </select>
        </label>
        <div className="mt-3">
          <Toggle checked={c.injectAsSystem} onChange={(v) => patch({ injectAsSystem: v })} label="Inject handoff as system message" />
        </div>
      </FrostCard>

      <FrostCard title="Handoff preview" subtitle="what the next account sees">
        <pre className="overflow-auto rounded-lg bg-black/40 p-3 font-mono text-[11px] text-blue-100/80">{`[ZESROUTER HANDOFF]
quota=${c.handoffThreshold}%  messages<=${c.maxMessages}
model=${c.summaryModel || "policy:cheap"}
inject=${c.injectAsSystem ? "system" : "user"}
summary: <compressed conversation gist>`}</pre>
      </FrostCard>
    </div>
  );
}
