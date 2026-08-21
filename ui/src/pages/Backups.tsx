import { useState } from "react";
import { Archive, Save, RotateCcw, RefreshCw, Database, FileText } from "lucide-react";
import GlassCard from "../components/ui/GlassCard";
import Badge from "../components/ui/Badge";
import { useStore, createBackup, restoreBackup } from "../lib/store";
import { localTime } from "../lib/format";
import { EmptyState } from "./Dashboard";

export default function Backups() {
  const { backups, config } = useStore();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmName, setConfirmName] = useState<string | null>(null);

  async function handleCreate() {
    setBusy(true);
    setResult(null);
    try {
      const r = await createBackup();
      if (r.ok) setResult({ ok: true, text: `created: ${(r.created ?? []).join(", ")}` });
      else setResult({ ok: false, text: r.error ?? "create failed" });
    } catch (e) {
      setResult({ ok: false, text: String(e) });
    }
    setBusy(false);
  }

  async function handleRestore(name: string) {
    setConfirmName(null);
    try {
      await restoreBackup(name);
    } catch {
      /* daemon reload — keep */
    }
  }

  const sorted = [...backups].sort((a, b) => (a.name < b.name ? 1 : -1));

  return (
    <div className="space-y-4 sm:space-y-6">
      <GlassCard variant="cyan" title="Create snapshot" subtitle="bitrouter.yaml + DB copies · /root/.bitrouter · pruned to last 20"
        icon={<Archive size={16} />}
        action={<Badge variant="neutral">{backups.length} stored</Badge>}
      >
        <p className="text-xs text-white/40">
          Config and DB copies are stored under <span className="font-mono text-white/60">/root/.bitrouter</span> inside proot
          and pruned to the last 20 snapshots. Restoring copies a <span className="font-mono text-white/60">.bak</span> file back
          over the live config.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={handleCreate}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/15 px-2.5 py-1.5 text-xs text-cyan-300 transition hover:bg-cyan-500/25 active:scale-95 disabled:opacity-60"
          >
            {busy ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
            {busy ? "Creating…" : "Create Snapshot"}
          </button>
          {result && (
            <span className={`text-xs ${result.ok ? "text-green-400" : "text-red-400"}`}>{result.text}</span>
          )}
        </div>
      </GlassCard>

      <GlassCard variant="blue" title="Snapshots" subtitle="config + db pairs appear as separate entries" icon={<Database size={16} />}>
        {sorted.length === 0 ? (
          <EmptyState text="No snapshots yet — create one above." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-white/35">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Modified</th>
                    <th className="py-2 pr-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((b) => (
                    <tr key={b.name} className="border-b border-white/5 last:border-0">
                      <td className="py-2.5 pr-3">
                        <span className="flex items-center gap-1.5 font-mono text-xs text-white/80">
                          <FileText size={12} className="shrink-0 text-white/35" />
                          {b.name}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-white/50">{localTime(b.mtime)}</td>
                      <td className="py-2.5 pr-3 text-right">
                        {confirmName === b.name ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleRestore(b.name)}
                              className="rounded-md border border-orange-400/40 bg-orange-500/20 px-2 py-1 text-[11px] text-orange-300"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmName(null)}
                              className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/50"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmName(b.name)}
                            className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/60 hover:bg-white/10 active:scale-95"
                          >
                            <RotateCcw size={12} /> Restore
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/40">
              Restoring a config snapshot reloads the daemon — active requests may be dropped.
            </p>
          </>
        )}
      </GlassCard>
    </div>
  );
}