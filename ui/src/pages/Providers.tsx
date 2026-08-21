import { useState } from "react";
import { KeyRound, KeySquare, PenBox, Server, Save, Trash2, RefreshCw, FlaskConical } from "lucide-react";
import GlassCard from "../components/ui/GlassCard";
import Badge from "../components/ui/Badge";
import { useStore, setProviderKey, restartDaemon, testProvider } from "../lib/store";
import { avgLatency, costSum, errorRate, withinHours } from "../lib/stats";
import { usd } from "../lib/format";
import { EmptyState } from "./Dashboard";

export default function Providers() {
  const { requests, providers } = useStore();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [notice, setNotice] = useState<{ pid: string; kind: "ok" | "err"; text: string } | null>(null);

  const last24h = withinHours(requests, 24);

  const rows = providers.map((p) => {
    const reqs = last24h.filter((r) => r.provider_id === p.id);
    const success = reqs.filter((r) => !r.error).length;
    const errors = reqs.filter((r) => r.error).length;
    const rate = errorRate(reqs);
    return {
      ...p,
      count: reqs.length,
      success,
      errors,
      rate,
      latency: avgLatency(reqs),
      cost: costSum(reqs),
    };
  }).sort((a, b) => b.rate - a.rate);

  const keyless = (p: { authEnvVar: string }) => p.authEnvVar === "none";

  async function runTest(pid: string) {
    setTesting(pid);
    setTestResult((t) => ({ ...t, [pid]: { ok: true, text: "probing…" } }));
    const r = await testProvider(pid);
    const text = r.ok
      ? `OK — ${r.model} in ${r.latencyMs}ms`
      : `FAIL — ${r.status ? `HTTP ${r.status} ` : ""}${(r.detail ?? r.error ?? "").slice(0, 80)}`;
    setTestResult((t) => ({ ...t, [pid]: { ok: r.ok, text } }));
    setTesting(null);
  }

  async function saveKey(pid: string, key: string) {
    setBusy(pid);
    setNotice(null);
    const r = await setProviderKey(pid, key.trim() || null);
    if (!r.ok) {
      setNotice({ pid, kind: "err", text: r.error ?? "failed" });
      setBusy(null);
      return;
    }
    setDrafts((d) => ({ ...d, [pid]: "" }));
    setNotice({ pid, kind: "ok", text: r.message ?? "saved" });
    setBusy(null);
    restartDaemon();
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((p) => {
          const isHot = p.rate > 20;
          const draft = drafts[p.id] ?? "";
          return (
            <GlassCard
              key={p.id}
              variant={isHot ? "red" : "green"}
              title={p.name}
              subtitle={p.apiBase}
              icon={<Server size={16} />}
              action={<Badge variant={p.enabled ? "green" : "neutral"} dot>{p.enabled ? "enabled" : "disabled"}</Badge>}
            >
              <div className="mb-3 flex items-center gap-1.5 text-xs text-white/50">
                {keyless(p) ? (
                  <KeySquare size={13} className="text-cyan-400" />
                ) : p.hasKey ? (
                  <KeyRound size={13} className="text-green-400" />
                ) : (
                  <KeySquare size={13} className="text-red-400" />
                )}
                <span className="font-mono text-[11px]">{p.authEnvVar}</span>
                <Badge variant={keyless(p) ? "cyan" : p.hasKey ? "green" : "red"} className="ml-auto">
                  {keyless(p) ? "keyless" : p.hasKey ? "key set" : "key missing"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <MiniStat label="Reqs (24h)" value={String(p.count)} />
                <MiniStat label="Success" value={String(p.success)} />
                <MiniStat label="Errors" value={String(p.errors)} accent={p.errors > 0 ? "text-red-400" : undefined} />
                <MiniStat label="Avg lat" value={`${p.latency}ms`} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-white/40">Cost (24h)</span>
                <span className="font-mono text-white/80">{usd(p.cost)}</span>
              </div>
              <div className="mt-2">
                <div className="mb-1 flex justify-between text-[10px] text-white/40">
                  <span>Error rate</span>
                  <span className={isHot ? "text-red-400" : "text-white/50"}>{p.rate.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className={`h-full rounded-full ${isHot ? "bg-red-500" : "bg-green-400"}`}
                    style={{ width: `${Math.min(p.rate, 100)}%` }}
                  />
                </div>
              </div>

              {!keyless(p) && (
                <div className="mt-3 border-t border-white/10 pt-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/35">
                    <PenBox size={11} />
                    API key
                    <Badge variant="neutral" className="ml-1">{p.hasKey ? "set" : "unset"}</Badge>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="password"
                      value={draft}
                      onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                      placeholder={p.hasKey ? "••••••••  type to replace" : "paste API key"}
                      autoComplete="off"
                      className="w-full min-w-0 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder:text-white/25 focus:border-blue-400/50 focus:outline-none"
                    />
                    <button
                      onClick={() => saveKey(p.id, draft)}
                      disabled={busy === p.id || !draft.trim()}
                      className="flex shrink-0 items-center gap-1 rounded-lg border border-blue-400/30 bg-blue-500/15 px-2.5 py-1.5 text-xs font-medium text-blue-300 transition hover:bg-blue-500/25 active:scale-95 disabled:opacity-40"
                    >
                      {busy === p.id ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                      Save
                    </button>
                    {p.hasKey && (
                      <button
                        onClick={() => saveKey(p.id, "")}
                        disabled={busy === p.id}
                        title="Remove key"
                        className="flex shrink-0 items-center gap-1 rounded-lg border border-red-400/25 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300/80 transition hover:bg-red-500/20 active:scale-95 disabled:opacity-40"
                      >
                        <Trash2 size={12} /> Clear
                      </button>
                    )}
                  </div>
                  {notice && notice.pid === p.id && (
                    <p className={`mt-1.5 text-[11px] ${notice.kind === "ok" ? "text-green-300" : "text-red-300"}`}>
                      {notice.text}
                    </p>
                  )}

                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => runTest(p.id)}
                      disabled={testing === p.id}
                      className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/70 transition hover:bg-white/10 active:scale-95 disabled:opacity-40"
                    >
                      {testing === p.id ? <RefreshCw size={12} className="animate-spin" /> : <FlaskConical size={12} />}
                      Test
                    </button>
                    {testResult[p.id] && (
                      <span className={`truncate text-[11px] font-mono ${testResult[p.id].ok ? "text-green-300" : "text-red-300"}`}>
                        {testResult[p.id].text}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>
      {rows.every((r) => r.count === 0) && <EmptyState text="No provider traffic recorded in the last 24h yet." />}
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-white/35">{label}</p>
      <p className={`font-mono text-xs font-semibold ${accent ?? "text-white/85"}`}>{value}</p>
    </div>
  );
}