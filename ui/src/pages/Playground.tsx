import { useRef, useState } from "react";
import { Play, Square, Clock } from "lucide-react";
import FrostCard from "../components/ui/FrostCard";
import Badge from "../components/ui/Badge";
import CodeEditor from "../components/ui/CodeEditor";
import { useStore, authHeaders } from "../lib/store";
import { compressText } from "../lib/compress";
import { COMPRESSION_ENGINES } from "../lib/catalog";

export default function Playground() {
  const { providers, models, dash } = useStore();
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState(models[0]?.id ?? "");
  const [endpoint, setEndpoint] = useState("/v1/chat/completions");
  const [prompt, setPrompt] = useState("Explain circuit breakers in one short paragraph.");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [metrics, setMetrics] = useState<{ ttft?: number; total?: number; chars?: number }>({});
  const [engine, setEngine] = useState(dash.settings.compressionDefault);
  const [level, setLevel] = useState(dash.settings.compressionLevel);
  const abortRef = useRef<AbortController | null>(null);

  const compressed = compressText(engine, prompt, level);
  const visibleModels = models.filter((m) => {
    if (provider && !m.providers.includes(provider)) return false;
    const hidden = dash.hiddenModels[provider] ?? [];
    return !hidden.includes(m.id);
  });

  async function run() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setOut("");
    setMetrics({});
    const t0 = performance.now();
    let ttft = 0;
    try {
      const modelId = provider ? `${provider}:${model}` : model;
      const r = await fetch("/api/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          model: modelId,
          endpoint,
          stream: true,
          messages: [{ role: "user", content: compressed.out }],
        }),
        signal: ac.signal,
      });
      if (!r.ok || !r.body) {
        setOut(`HTTP ${r.status} ${await r.text()}`);
        setBusy(false);
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!ttft) ttft = performance.now() - t0;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const s = line.trim();
          if (!s.startsWith("data:")) continue;
          const payload = s.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const j = JSON.parse(payload);
            const delta = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? j.delta?.text ?? "";
            if (delta) {
              acc += delta;
              setOut(acc);
            }
          } catch {
            acc += payload;
            setOut(acc);
          }
        }
      }
      setMetrics({ ttft: Math.round(ttft), total: Math.round(performance.now() - t0), chars: acc.length });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setOut(String(e));
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <FrostCard variant="blue-bg" title="Model playground" subtitle="Stream through the local /v1 gateway · abort anytime" icon={<Play size={16} />}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className="frost-input">
            <option value="">any provider</option>
            {providers.map((p) => <option key={p.id} value={p.id} className="bg-black">{p.name}</option>)}
          </select>
          <select value={model} onChange={(e) => setModel(e.target.value)} className="frost-input">
            {visibleModels.map((m) => <option key={m.id} value={m.id} className="bg-black">{m.id}</option>)}
          </select>
          <select value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="frost-input">
            <option>/v1/chat/completions</option>
            <option>/v1/responses</option>
            <option>/v1/messages</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={engine} onChange={(e) => setEngine(e.target.value)} className="frost-input !w-auto">
            {COMPRESSION_ENGINES.map((e) => <option key={e.id} value={e.id} className="bg-black">{e.name}</option>)}
          </select>
          <label className="text-xs text-white/50">level {level}
            <input type="range" min={1} max={3} value={level} onChange={(e) => setLevel(Number(e.target.value))} className="ml-2 align-middle" />
          </label>
          <Badge variant="cyan">-{compressed.savedPct}% tokens</Badge>
        </div>
      </FrostCard>

      <CodeEditor value={prompt} onChange={setPrompt} language="prompt" placeholder="Compose a prompt…" />

      <div className="flex flex-wrap gap-2">
        <button onClick={run} disabled={busy} className="frost-btn frost-btn-frost"><Play size={14} /> {busy ? "Streaming…" : "Run"}</button>
        <button onClick={() => abortRef.current?.abort()} className="frost-btn frost-btn-destructive"><Square size={14} /> Abort</button>
        {metrics.total != null && (
          <span className="flex items-center gap-2 text-xs text-white/50">
            <Clock size={12} /> TTFT {metrics.ttft}ms · total {metrics.total}ms · {metrics.chars} chars
          </span>
        )}
      </div>

      <FrostCard title="Response" subtitle="live stream">
        <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-blue-50/90">{out || "—"}</pre>
      </FrostCard>
    </div>
  );
}
