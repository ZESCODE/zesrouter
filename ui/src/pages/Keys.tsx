import { useState } from "react";
import { KeyRound, Plus, Copy, Check, Trash2 } from "lucide-react";
import GlassCard from "../components/ui/GlassCard";
import Badge from "../components/ui/Badge";
import { useStore, createKey, revokeKey } from "../lib/store";
import { maskKey, usd, localTime } from "../lib/format";
import { EmptyState } from "./Dashboard";

export default function Keys() {
  const { keys } = useStore();
  const [label, setLabel] = useState("");
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function handleCreate() {
    const created = await createKey(label.trim());
    setPlaintext(created.plaintext ?? "created (plaintext not returned)");
    setLabel("");
    setCopied(false);
  }

  function copy() {
    if (plaintext) {
      navigator.clipboard?.writeText(plaintext).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  }

  function handleRevoke(id: string) {
    revokeKey(id);
    setConfirmId(null);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <GlassCard variant="blue" title="Create Key" subtitle="Issues a new virtual API key scoped to a label" icon={<Plus size={16} />}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="label / scope, e.g. agent-nightly"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-blue-400/50 focus:outline-none"
          />
          <button
            onClick={handleCreate}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-blue-400/30 bg-blue-500/15 px-4 py-2 text-sm font-medium text-blue-300 transition hover:bg-blue-500/25 active:scale-95"
          >
            <Plus size={15} /> Create Key
          </button>
        </div>

        {plaintext && (
          <div className="mt-4 rounded-lg border border-green-400/25 bg-green-500/5 p-3">
            <p className="mb-2 text-xs text-green-300">
              Copy this key now — it will not be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-black/40 px-2.5 py-1.5 text-xs text-green-200">{plaintext}</code>
              <button
                onClick={copy}
                className="flex shrink-0 items-center gap-1 rounded-md border border-green-400/30 bg-green-500/10 px-2.5 py-1.5 text-xs text-green-300 active:scale-95"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      <GlassCard variant="blue" title="Virtual API Keys" subtitle={`${keys.length} total`} icon={<KeyRound size={16} />}>
        {keys.length === 0 ? (
          <EmptyState text="No virtual keys yet — create one above." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-white/35">
                  <th className="py-2 pr-3 font-medium">ID</th>
                  <th className="py-2 pr-3 font-medium">Key</th>
                  <th className="py-2 pr-3 font-medium">RPM</th>
                  <th className="py-2 pr-3 font-medium">Spend limit</th>
                  <th className="py-2 pr-3 font-medium">Expires</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-white/5 last:border-0">
                    <td className="py-2.5 pr-3 font-mono text-xs text-white/80">{k.label}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-white/60">{maskKey(k.key_hash)}</td>
                    <td className="py-2.5 pr-3 text-xs text-white/70">{k.rpm_limit}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-white/70">{usd(k.spend_limit_micro_usd)}</td>
                    <td className="py-2.5 pr-3 text-xs text-white/50">{k.expires_at ? localTime(k.expires_at) : "never"}</td>
                    <td className="py-2.5 pr-3">
                      <Badge variant={k.active ? "green" : "red"} dot>
                        {k.active ? "active" : "revoked"}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      {k.active && (
                        confirmId === k.id ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleRevoke(k.id)}
                              className="rounded-md border border-red-400/40 bg-red-500/20 px-2 py-1 text-[11px] text-red-300"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmId(null)}
                              className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/50"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmId(k.id)}
                            className="ml-auto flex items-center gap-1 rounded-md border border-red-400/20 px-2 py-1 text-[11px] text-red-300/80 hover:bg-red-500/10"
                          >
                            <Trash2 size={12} /> Revoke
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
