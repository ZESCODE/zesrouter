import { useState } from "react";
import { Route, Search, Info } from "lucide-react";
import GlassCard from "../components/ui/GlassCard";
import Badge from "../components/ui/Badge";
import { useStore } from "../lib/store";

export default function Models() {
  const { models, providers } = useStore();
  const [testModel, setTestModel] = useState("");
  const [result, setResult] = useState<null | { ok: boolean; text: string }>(null);
  const [filter, setFilter] = useState("");

  async function testRoute() {
    const trimmed = testModel.trim();
    if (!trimmed) {
      setResult({ ok: false, text: "Enter a model ID to resolve." });
      return;
    }
    setResult({ ok: true, text: "Resolving…" });
    try {
      const r = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: trimmed }),
      });
      const data = await r.json();
      setResult({
        ok: !!data.ok,
        text: data.ok ? `Resolved "${trimmed}" → ${data.result ? JSON.stringify(data.result) : "ok"}` : `Route failed: ${data.error ?? "unknown"}`,
      });
    } catch {
      setResult({ ok: false, text: "Backend unreachable." });
    }
  }

  const filtered = models.filter((m) => m.id.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="space-y-4 sm:space-y-6">
      <GlassCard variant="blue" title="Test Route" subtitle="Resolve a model ID through the live daemon" icon={<Search size={16} />}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={testModel}
            onChange={(e) => setTestModel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && testRoute()}
            placeholder="e.g. deepseek/deepseek-v4-flash-free"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white placeholder:text-white/25 focus:border-blue-400/50 focus:outline-none"
          />
          <button
            onClick={testRoute}
            className="shrink-0 rounded-lg border border-blue-400/30 bg-blue-500/15 px-4 py-2 text-sm font-medium text-blue-300 transition hover:bg-blue-500/25 active:scale-95"
          >
            Resolve
          </button>
        </div>
        {result && (
          <div
            className={`mt-3 rounded-lg border p-3 text-xs leading-relaxed ${
              result.ok ? "border-green-400/25 bg-green-500/5 text-green-200" : "border-red-400/25 bg-red-500/5 text-red-200"
            }`}
          >
            {result.text}
          </div>
        )}
      </GlassCard>

      <GlassCard variant="blue" title="Routing Table" subtitle={`${models.length} models configured`} icon={<Route size={16} />}
        action={
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter…"
            className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white placeholder:text-white/25 focus:border-blue-400/50 focus:outline-none sm:w-40"
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-white/35">
                <th className="py-2 pr-3 font-medium">Model ID</th>
                <th className="py-2 pr-3 font-medium">Provider Chain</th>
                <th className="py-2 pr-3 font-medium">Tier</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-b border-white/5 last:border-0">
                  <td className="py-2.5 pr-3 font-mono text-xs text-white/85">{m.id}</td>
                  <td className="py-2.5 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {m.providers.map((p, i) => (
                        <span key={p} className="flex items-center gap-1">
                          <Badge variant={i === 0 ? "blue" : "neutral"}>{p}</Badge>
                          {i < m.providers.length - 1 && <span className="text-white/20">→</span>}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge variant={m.tier === "flagship" ? "orange" : "cyan"}>{m.tier ?? "—"}</Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-xs text-white/35">
                    {models.length === 0 ? "Loading routing table…" : `No models match "${filter}".`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/40">
        <Info size={14} className="mt-0.5 shrink-0" />
        <p>Routing table is edited in Settings → Config (YAML), then Reload. Provider endpoints: {providers.map((p) => p.id).join(", ")}.</p>
      </div>
    </div>
  );
}