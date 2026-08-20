import { useState } from "react";
import { ShieldCheck, GitBranch, Sparkles, RefreshCw } from "lucide-react";
import GlassCard from "../components/ui/GlassCard";
import Badge from "../components/ui/Badge";
import { reloadDaemon, useStore } from "../lib/store";

export default function Policy() {
  const { policy } = useStore();
  const [reloading, setReloading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function doReload() {
    setReloading(true);
    setMsg(null);
    setTimeout(() => {
      reloadDaemon();
      setReloading(false);
      setMsg("Config reloaded successfully — policy_table re-read from bitrouter.yaml.");
    }, 900);
  }

  if (!policy) {
    return (
      <GlassCard variant="orange" title="Policy" subtitle="policy_table" icon={<ShieldCheck size={16} />}>
        <p className="text-xs text-white/40">Loading policy from config…</p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GlassCard variant="orange" title="Tiers" subtitle="policy_table.tiers" icon={<ShieldCheck size={16} />}>
          <div className="space-y-2">
            <TierRow label="cheap" model={policy.tiers.cheap} color="cyan" />
            <TierRow label="flagship" model={policy.tiers.flagship} color="orange" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <InfoTile label="Default tier" value={policy.default_tier} />
            <InfoTile label="Tool-use tier" value={policy.tool_use_tier} />
          </div>
        </GlassCard>

        <GlassCard variant="orange" title="Adequacy" subtitle="self-improvement policy" icon={<Sparkles size={16} />}>
          <div className="flex items-center justify-between rounded-lg bg-white/[0.04] p-3">
            <span className="text-sm text-white/70">Adequacy engine</span>
            <Badge variant={policy.adequacy.enabled ? "green" : "neutral"} dot>
              {policy.adequacy.enabled ? "enabled" : "disabled"}
            </Badge>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-white/[0.04] p-3">
            <span className="text-sm text-white/70">Escalation tier</span>
            <Badge variant="orange">{policy.adequacy.escalation_tier}</Badge>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-white/35">
            Adequacy observes agent loops (adequacy_pins / adequacy_exploration tables), and publishes a policy-lock.yaml
            to pin known-good routes over time.
          </p>
        </GlassCard>
      </div>

      <GlassCard variant="orange" title="Workflow Fingerprints" subtitle="state → tier mapping" icon={<GitBranch size={16} />}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {policy.fingerprints.map((f) => (
            <div key={f.state} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
              <span className="truncate font-mono text-xs text-white/70">{f.state}</span>
              <Badge variant={f.tier === "flagship" ? "orange" : "cyan"}>{f.tier}</Badge>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard variant="orange" title="Reload Daemon" subtitle="Apply the latest saved config" icon={<RefreshCw size={16} />}>
        <p className="mb-3 text-xs text-white/40">
          Policy is read-only here — edit the YAML via Settings → Config, then hot-reload the daemon.
        </p>
        <button
          onClick={doReload}
          disabled={reloading}
          className="flex items-center gap-2 rounded-lg border border-orange-400/30 bg-orange-500/15 px-4 py-2 text-sm font-medium text-orange-300 transition hover:bg-orange-500/25 active:scale-95 disabled:opacity-50"
        >
          <RefreshCw size={15} className={reloading ? "animate-spin" : ""} />
          {reloading ? "Reloading…" : "Reload daemon"}
        </button>
        {msg && <p className="mt-3 rounded-lg border border-green-400/20 bg-green-500/5 p-2.5 text-xs text-green-300">{msg}</p>}
      </GlassCard>
    </div>
  );
}

function TierRow({ label, model, color }: { label: string; model: string; color: "cyan" | "orange" }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/[0.04] p-3">
      <Badge variant={color}>{label}</Badge>
      <span className="truncate pl-3 font-mono text-xs text-white/75">{model}</span>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-white/35">{label}</p>
      <p className="mt-0.5 font-mono text-xs text-white/85">{value}</p>
    </div>
  );
}
