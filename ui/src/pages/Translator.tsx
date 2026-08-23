import { useEffect, useState } from "react";
import { Languages, FlaskConical, Radio } from "lucide-react";
import FrostCard from "../components/ui/FrostCard";
import Badge from "../components/ui/Badge";
import CodeEditor from "../components/ui/CodeEditor";
import { detectFormat, translate, type WireFormat } from "../lib/translate";
import { useStore, authHeaders } from "../lib/store";
import type { PageId } from "../lib/nav";

const SAMPLE = JSON.stringify({ model: "opencode/muse-spark-1.2-contributor-free", messages: [{ role: "user", content: "ping" }] }, null, 2);

export default function Translator({ parts, setPage }: { parts: string[]; setPage: (p: PageId, parts?: string[]) => void }) {
  const tab = parts[0] || "playground";
  const tabs = [
    { id: "playground", label: "Playground" },
    { id: "chat-tester", label: "Chat Tester" },
    { id: "test-bench", label: "Test Bench" },
    { id: "live-monitor", label: "Live Monitor" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setPage("translator", [t.id])} className={`frost-btn !min-h-11 ${tab === t.id ? "frost-btn-frost" : ""}`}>{t.label}</button>
        ))}
      </div>
      {tab === "chat-tester" ? <ChatTester /> : tab === "test-bench" ? <TestBench /> : tab === "live-monitor" ? <LiveMon /> : <Play />}
    </div>
  );
}

function Play() {
  const [src, setSrc] = useState(SAMPLE);
  const [to, setTo] = useState<WireFormat>("anthropic");
  const from = detectFormat(src);
  const res = translate(src, to);
  return (
    <FrostCard variant="blue-bg" title="Format converter" subtitle={`detected ${from} → ${to}`} icon={<Languages size={16} />}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(["openai-chat", "openai-responses", "anthropic", "gemini"] as WireFormat[]).map((f) => (
          <button key={f} onClick={() => setTo(f)} className={`frost-btn ${to === f ? "frost-btn-frost" : ""}`}>{f}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <CodeEditor value={src} onChange={setSrc} language="json" />
        <CodeEditor value={res.out} onChange={() => {}} language="json" />
      </div>
    </FrostCard>
  );
}

function ChatTester() {
  const { models } = useStore();
  const [model, setModel] = useState(models[0]?.id ?? "");
  const [msg, setMsg] = useState("Say hi in 5 words.");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setOut("");
    try {
      const r = await fetch("/api/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ model, stream: false, messages: [{ role: "user", content: msg }] }),
      });
      setOut(await r.text());
    } catch (e) {
      setOut(String(e));
    }
    setBusy(false);
  }

  return (
    <FrostCard title="Live request" icon={<FlaskConical size={16} />}>
      <select value={model} onChange={(e) => setModel(e.target.value)} className="frost-input mb-2">
        {models.map((m) => <option key={m.id} value={m.id} className="bg-black">{m.id}</option>)}
      </select>
      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} className="frost-input mb-2 min-h-24" />
      <button onClick={send} disabled={busy} className="frost-btn frost-btn-frost">{busy ? "Sending…" : "Send"}</button>
      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-blue-100/80">{out}</pre>
    </FrostCard>
  );
}

function TestBench() {
  const cases: { name: string; body: string; to: WireFormat }[] = [
    { name: "OpenAI → Anthropic", body: SAMPLE, to: "anthropic" },
    { name: "OpenAI → Gemini", body: SAMPLE, to: "gemini" },
    { name: "OpenAI → Responses", body: SAMPLE, to: "openai-responses" },
  ];
  return (
    <FrostCard title="Batch tests">
      <div className="space-y-2">
        {cases.map((c) => {
          const r = translate(c.body, c.to);
          return (
            <div key={c.name} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm">{c.name}</span>
                <Badge variant={r.ok ? "green" : "red"}>{r.ok ? "pass" : "fail"}</Badge>
              </div>
              <p className="font-mono text-[10px] text-white/40">{r.from} → {c.to}</p>
            </div>
          );
        })}
      </div>
    </FrostCard>
  );
}

function LiveMon() {
  const { sseEvents } = useStore();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <FrostCard title="Real-time stream" subtitle={`tick ${tick} · ${sseEvents.length} events`} icon={<Radio size={16} />}>
      <div className="max-h-[50vh] space-y-1 overflow-auto font-mono text-[11px]">
        {sseEvents.slice(0, 40).map((e) => (
          <div key={e.id} className="rounded px-2 py-1 text-white/70">
            <span className="text-white/30">{e.ts}</span> <Badge>{e.type}</Badge> {e.message}
          </div>
        ))}
        {sseEvents.length === 0 && <p className="text-white/35">Waiting for gateway events…</p>}
      </div>
    </FrostCard>
  );
}
