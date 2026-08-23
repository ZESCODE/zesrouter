import { Activity, DollarSign, PieChart, Sparkles } from "lucide-react";
import FrostCard from "../components/ui/FrostCard";
import Badge from "../components/ui/Badge";
import Heatmap from "../components/ui/Heatmap";
import EmptyState from "../components/ui/EmptyState";
import { useStore } from "../lib/store";
import { usd } from "../lib/format";
import { compressText } from "../lib/compress";
import { COMPRESSION_ENGINES } from "../lib/catalog";
import { hourlyBuckets, withinHours, groupByProvider } from "../lib/stats";
import type { PageId } from "../lib/nav";

export default function Analytics({ parts, setPage }: { parts: string[]; setPage: (p: PageId, parts?: string[]) => void }) {
  const tab = parts[0] || "overview";
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "tokens", label: "Tokens" },
    { id: "cost", label: "Cost" },
    { id: "providers", label: "Providers" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setPage("analytics", t.id === "overview" ? [] : [t.id])} className={`frost-btn !min-h-11 ${tab === t.id ? "frost-btn-frost" : ""}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "tokens" ? <TokensPane /> : tab === "cost" ? <CostPane /> : tab === "providers" ? <ProvPane /> : <OverviewPane setPage={setPage} />}
    </div>
  );
}

function OverviewPane({ setPage }: { setPage: (p: PageId, parts?: string[]) => void }) {
  const { requests, costs, dash } = useStore();
  const last = withinHours(requests, 24);
  const tokensIn = last.reduce((s, r) => s + r.prompt_tokens, 0);
  const tokensOut = last.reduce((s, r) => s + r.completion_tokens, 0);
  const sample = last.slice(0, 20).map((r) => r.model_id).join(" ");
  const saved = compressText(dash.settings.compressionDefault, sample || "hello world", dash.settings.compressionLevel);
  const heat = hourlyBuckets(requests, 168);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FrostCard className="!p-4"><p className="text-xl font-bold">{tokensIn.toLocaleString()}</p><p className="text-[11px] text-white/40">prompt tokens</p></FrostCard>
        <FrostCard variant="green" className="!p-4"><p className="text-xl font-bold">{tokensOut.toLocaleString()}</p><p className="text-[11px] text-white/40">completion tokens</p></FrostCard>
        <FrostCard variant="orange" className="!p-4"><p className="text-xl font-bold">{usd((costs?.byProvider ?? []).reduce((s, p) => s + p.cost_micro, 0))}</p><p className="text-[11px] text-white/40">spend 24h</p></FrostCard>
        <FrostCard variant="cyan" className="!p-4"><p className="text-xl font-bold">{saved.savedPct}%</p><p className="text-[11px] text-white/40">est. RTK save</p></FrostCard>
      </div>
      <FrostCard title="Activity heatmap" subtitle="hourly · 7 days" icon={<Activity size={16} />}>
        <Heatmap values={heat} cols={24} />
      </FrostCard>
      <FrostCard title="AI usage pattern" subtitle="heuristic on last 24h" icon={<Sparkles size={16} />}>
        <p className="text-sm text-white/70">
          {last.length === 0
            ? "Idle — no traffic to profile yet."
            : `Most traffic is ${topKey(last.map((r) => r.provider_id))} / ${topKey(last.map((r) => r.model_id))}. Stream ratio ${(last.filter((r) => r.streamed).length / last.length * 100).toFixed(0)}%. Peak hour bucket ${heat.indexOf(Math.max(...heat)) % 24}:00.`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="frost-btn frost-btn-frost" onClick={() => setPage("analytics", ["tokens"])}>Token breakdown</button>
          <button className="frost-btn" onClick={() => setPage("analytics", ["cost"])}>Cost</button>
        </div>
      </FrostCard>
    </>
  );
}

function TokensPane() {
  const { requests, dash } = useStore();
  const last = withinHours(requests, 24);
  const by = new Map<string, { in: number; out: number; n: number }>();
  for (const r of last) {
    const cur = by.get(r.model_id) ?? { in: 0, out: 0, n: 0 };
    cur.in += r.prompt_tokens;
    cur.out += r.completion_tokens;
    cur.n += 1;
    by.set(r.model_id, cur);
  }
  const rows = [...by.entries()].sort((a, b) => b[1].in + b[1].out - (a[1].in + a[1].out));
  return (
    <FrostCard title="Token consumption" subtitle={`engine ${dash.settings.compressionDefault} · level ${dash.settings.compressionLevel}`} icon={<Activity size={16} />}>
      {rows.length === 0 ? <EmptyState text="No token data yet." /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead><tr className="border-b border-white/10 text-[11px] uppercase text-white/35"><th className="py-2">Model</th><th>Prompt</th><th>Completion</th><th>Reqs</th></tr></thead>
            <tbody>
              {rows.map(([id, v]) => (
                <tr key={id} className="border-b border-white/5">
                  <td className="py-2 font-mono text-xs">{id}</td>
                  <td className="font-mono text-xs">{v.in.toLocaleString()}</td>
                  <td className="font-mono text-xs">{v.out.toLocaleString()}</td>
                  <td className="font-mono text-xs">{v.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {COMPRESSION_ENGINES.map((e) => <Badge key={e.id}>{e.name.split("·")[0].trim()}</Badge>)}
      </div>
    </FrostCard>
  );
}

function CostPane() {
  const { costs } = useStore();
  const daily = costs?.daily ?? [];
  const max = Math.max(...daily.map((d) => d.cost_micro), 1);
  return (
    <FrostCard title="Cost estimates" subtitle="14-day series" icon={<DollarSign size={16} />}>
      {daily.length === 0 ? <EmptyState text="No cost series yet." /> : (
        <>
          <div className="flex h-36 items-end gap-1">
            {daily.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center justify-end">
                <div className="w-full rounded-t bg-blue-400" style={{ height: `${Math.max(4, (d.cost_micro / max) * 100)}%` }} title={usd(d.cost_micro)} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1">
            {daily.map((d) => <span key={d.day} className="flex-1 truncate text-center text-[9px] text-white/35">{d.day.slice(5)}</span>)}
          </div>
        </>
      )}
    </FrostCard>
  );
}

function ProvPane() {
  const { requests, providers } = useStore();
  const last = withinHours(requests, 24);
  const g = groupByProvider(last);
  return (
    <FrostCard title="Per-provider breakdown" icon={<PieChart size={16} />}>
      {g.size === 0 ? <EmptyState text="No provider traffic." /> : (
        <div className="space-y-2">
          {[...g.entries()].map(([id, reqs]) => {
            const name = providers.find((p) => p.id === id)?.name ?? id;
            return (
              <div key={id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-1 flex justify-between text-sm">
                  <span>{name}</span>
                  <Badge>{reqs.length} req</Badge>
                </div>
                <p className="font-mono text-[11px] text-white/45">
                  tok {reqs.reduce((s, r) => s + r.prompt_tokens + r.completion_tokens, 0).toLocaleString()} · {usd(reqs.reduce((s, r) => s + r.estimated_charge_micro_usd, 0))}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </FrostCard>
  );
}

function topKey(arr: string[]) {
  const m = new Map<string, number>();
  for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
}
