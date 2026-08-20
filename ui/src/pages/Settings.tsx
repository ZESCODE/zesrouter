import { useState } from "react";
import { FileCode, ShieldAlert, History, Power, PlayCircle, RotateCcw, CheckCircle2 } from "lucide-react";
import GlassCard from "../components/ui/GlassCard";
import Badge from "../components/ui/Badge";
import { useStore, setDaemonRunning, reloadDaemon } from "../lib/store";
import { localTime } from "../lib/format";

async function api(path: string, body?: unknown) {
  const r = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return r.json();
}

export default function Settings() {
  const { daemonRunning, config, backups } = useStore();
  const [yaml, setYaml] = useState<string | null>(config);
  const [cliOutput, setCliOutput] = useState<string | null>(null);
  const [busy, setBusy] = useState<"validate" | "save" | "restore" | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [confirmDanger, setConfirmDanger] = useState<"stop" | "start" | null>(null);

  function show(out: string) {
    setCliOutput(out);
    setBusy(null);
  }

  async function validate() {
    setBusy("validate");
    setCliOutput(null);
    const r = await api("/api/config/validate", { yaml });
    show(`$ bitrouter config validate\n${JSON.stringify(r, null, 2)}`);
  }

  async function saveAndReload() {
    setBusy("save");
    setCliOutput(null);
    const r = await api("/api/config/save", { yaml, reload: true });
    show(`$ write bitrouter.yaml + reload\n${JSON.stringify(r, null, 2)}`);
    if (r.ok) reloadDaemon();
  }

  async function restoreBackup(name: string) {
    setBusy("restore");
    setCliOutput(null);
    const r = await api("/api/backups/restore", { name });
    show(`$ restore ${name} + reload\n${JSON.stringify(r, null, 2)}`);
    setRestoreTarget(null);
    reloadDaemon();
  }

  function danger(action: "stop" | "start") {
    setDaemonRunning(action === "start");
    setCliOutput(`$ bitrouter ${action} — requested`);
    setConfirmDanger(null);
  }

  if (config !== null && yaml === null) setYaml(config);

  return (
    <div className="space-y-4 sm:space-y-6">
      <GlassCard variant="orange" title="Config Editor" subtitle="/root/.bitrouter/bitrouter.yaml" icon={<FileCode size={16} />}>
        <textarea
          value={yaml ?? "Loading config…"}
          onChange={(e) => setYaml(e.target.value)}
          spellCheck={false}
          rows={16}
          className="w-full resize-y rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-xs leading-relaxed text-white/85 focus:border-orange-400/40 focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={validate}
            disabled={busy !== null || yaml === null}
            className="flex items-center gap-1.5 rounded-lg border border-orange-400/30 bg-orange-500/15 px-3.5 py-2 text-xs font-medium text-orange-300 hover:bg-orange-500/25 active:scale-95 disabled:opacity-50"
          >
            <CheckCircle2 size={14} />
            {busy === "validate" ? "Validating…" : "Validate"}
          </button>
          <button
            onClick={saveAndReload}
            disabled={busy !== null || yaml === null}
            className="flex items-center gap-1.5 rounded-lg border border-blue-400/30 bg-blue-500/15 px-3.5 py-2 text-xs font-medium text-blue-300 hover:bg-blue-500/25 active:scale-95 disabled:opacity-50"
          >
            <RotateCcw size={14} />
            {busy === "save" ? "Saving…" : "Save + Reload"}
          </button>
        </div>
        {cliOutput && (
          <pre className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-black/60 p-3 text-[11px] leading-relaxed text-green-300/90">
            {cliOutput}
          </pre>
        )}
      </GlassCard>

      <GlassCard variant="orange" title="Config Backups" subtitle="bitrouter.yaml.bak-*" icon={<History size={16} />}>
        {backups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-white/35">
            No backups found.
          </p>
        ) : (
          <div className="space-y-2">
            {backups.map((b) => (
              <div key={b.name} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-white/75">{b.name}</p>
                  <p className="text-[10px] text-white/35">{localTime(b.mtime)}</p>
                </div>
                {restoreTarget === b.name ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => restoreBackup(b.name)}
                      disabled={busy !== null}
                      className="rounded-md border border-orange-400/40 bg-orange-500/20 px-2 py-1 text-[11px] text-orange-300"
                    >
                      {busy === "restore" ? "Restoring…" : "Confirm restore"}
                    </button>
                    <button onClick={() => setRestoreTarget(null)} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/50">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setRestoreTarget(b.name)}
                    className="rounded-md border border-white/15 px-2.5 py-1 text-[11px] text-white/60 hover:bg-white/5"
                  >
                    Restore
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard variant="red" title="Danger Zone" subtitle="Daemon lifecycle controls" icon={<ShieldAlert size={16} />}>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={daemonRunning ? "green" : "red"} dot>
            {daemonRunning ? "Daemon running" : "Daemon stopped"}
          </Badge>
          <div className="ml-auto flex gap-2">
            {confirmDanger ? (
              <>
                <span className="self-center text-xs text-white/50">Confirm {confirmDanger}?</span>
                <button
                  onClick={() => danger(confirmDanger)}
                  className="rounded-lg border border-red-400/40 bg-red-500/20 px-3 py-1.5 text-xs text-red-300"
                >
                  Yes, {confirmDanger}
                </button>
                <button onClick={() => setConfirmDanger(null)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/50">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setConfirmDanger("stop")}
                  disabled={!daemonRunning}
                  className="flex items-center gap-1.5 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 disabled:opacity-30"
                >
                  <Power size={13} /> Stop
                </button>
                <button
                  onClick={() => setConfirmDanger("start")}
                  disabled={daemonRunning}
                  className="flex items-center gap-1.5 rounded-lg border border-green-400/30 bg-green-500/10 px-3 py-1.5 text-xs text-green-300 disabled:opacity-30"
                >
                  <PlayCircle size={13} /> Start
                </button>
              </>
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}