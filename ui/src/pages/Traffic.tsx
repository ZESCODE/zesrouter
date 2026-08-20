import { useMemo, useState } from "react";
import { Activity, ListFilter } from "lucide-react";
import GlassCard from "../components/ui/GlassCard";
import Badge from "../components/ui/Badge";
import Sparkline from "../components/ui/Sparkline";
import { useStore } from "../lib/store";
import { hourlyBuckets, withinRange } from "../lib/stats";
import { localTime, truncate, usd } from "../lib/format";
import { EmptyState } from "./Dashboard";

const RANGES: { id: string; label: string; hours: number }[] = [
  { id: "1h", label: "1h", hours: 1 },
  { id: "6h", label: "6h", hours: 6 },
  { id: "24h", label: "24h", hours: 24 },
  { id: "7d", label: "7d", hours: 168 },
];

const PAGE_SIZE = 50;

export default function Traffic() {
  const { requests, models, providers } = useStore();
  const [range, setRange] = useState("24h");
  const [modelFilter, setModelFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [page, setPage] = useState(1);

  const hours = RANGES.find((r) => r.id === range)?.hours ?? 24;
  const filtered = useMemo(() => {
    let rows = withinRange(requests, Date.now() - hours * 3600 * 1000, Date.now());
    if (modelFilter !== "all") rows = rows.filter((r) => r.model_id === modelFilter);
    if (providerFilter !== "all") rows = rows.filter((r) => r.provider_id === providerFilter);
    if (errorsOnly) rows = rows.filter((r) => r.error);
    return rows;
  }, [requests, hours, modelFilter, providerFilter, errorsOnly]);

  const totalCost = filtered.reduce((s, r) => s + r.estimated_charge_micro_usd, 0);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const buckets = hourlyBuckets(requests, 24);

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <GlassCard variant="blue" title="Requests · last 24h" icon={<Activity size={16} />}>
        <Sparkline values={buckets} color="#60a5fa" width={600} height={50} />
      </GlassCard>

      <GlassCard variant="blue" title="Filters" icon={<ListFilter size={16} />}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Select label="Range" value={range} onChange={resetPage(setRange)} options={RANGES.map((r) => ({ value: r.id, label: r.label }))} />
          <Select
            label="Model"
            value={modelFilter}
            onChange={resetPage(setModelFilter)}
            options={[{ value: "all", label: "All models" }, ...models.map((m) => ({ value: m.id, label: m.id }))]}
          />
          <Select
            label="Provider"
            value={providerFilter}
            onChange={resetPage(setProviderFilter)}
            options={[{ value: "all", label: "All providers" }, ...providers.map((p) => ({ value: p.id, label: p.name }))]}
          />
          <label className="flex flex-col justify-end gap-1">
            <span className="text-[10px] uppercase tracking-wide text-white/35">Errors</span>
            <button
              onClick={() => resetPage(setErrorsOnly)(!errorsOnly)}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition ${
                errorsOnly ? "border-red-400/40 bg-red-500/15 text-red-300" : "border-white/10 bg-white/5 text-white/50"
              }`}
            >
              {errorsOnly ? "Errors only" : "All statuses"}
            </button>
          </label>
        </div>
      </GlassCard>

      <GlassCard variant="blue" title="Request Log" subtitle={`${filtered.length} rows · page ${page}/${totalPages}`} icon={<Activity size={16} />}>
        {filtered.length === 0 ? (
          <EmptyState text="No requests match the current filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-wide text-white/35">
                    <th className="py-2 pr-3 font-medium">Time</th>
                    <th className="py-2 pr-3 font-medium">Model</th>
                    <th className="py-2 pr-3 font-medium">Provider</th>
                    <th className="py-2 pr-3 font-medium">Tokens (p/c)</th>
                    <th className="py-2 pr-3 font-medium">Cost</th>
                    <th className="py-2 pr-3 font-medium">Latency</th>
                    <th className="py-2 pr-3 font-medium">Stream</th>
                    <th className="py-2 pr-3 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.request_id} className={`border-b border-white/5 last:border-0 ${r.error ? "bg-red-500/[0.06]" : ""}`}>
                      <td className="py-2 pr-3 font-mono whitespace-nowrap text-white/60">{localTime(r.created_at)}</td>
                      <td className="py-2 pr-3 font-mono text-white/80">{r.model_id}</td>
                      <td className="py-2 pr-3 text-white/60">{r.provider_id}</td>
                      <td className="py-2 pr-3 font-mono text-white/60">
                        {r.prompt_tokens}/{r.completion_tokens}
                      </td>
                      <td className="py-2 pr-3 font-mono text-white/70">{usd(r.estimated_charge_micro_usd)}</td>
                      <td className="py-2 pr-3 font-mono text-white/60">{r.latency_ms}ms</td>
                      <td className="py-2 pr-3">
                        <Badge variant={r.streamed ? "blue" : "neutral"}>{r.streamed ? "stream" : "sync"}</Badge>
                      </td>
                      <td className="max-w-[220px] py-2 pr-3 text-red-300/85">{r.error ? truncate(r.error, 100) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-white/10 text-white/60">
                    <td colSpan={4} className="py-2 pr-3 text-right text-[11px] uppercase tracking-wide text-white/35">
                      Totals
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-white/80">{usd(totalCost)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 disabled:opacity-30"
              >
                ← Prev
              </button>
              <span className="text-xs text-white/40">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          </>
        )}
      </GlassCard>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-white/35">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-blue-400/50 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-black">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
