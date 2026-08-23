import { useState } from "react";
import { Bot, Plus, Trash2 } from "lucide-react";
import FrostCard from "../components/ui/FrostCard";
import Badge from "../components/ui/Badge";
import EmptyState from "../components/ui/EmptyState";
import { BUILTIN_AGENTS, MCP_TOOLS } from "../lib/catalog";
import { useStore, saveDash } from "../lib/store";
import type { PageId } from "../lib/nav";

export default function Agents({ parts, setPage }: { parts: string[]; setPage: (p: PageId, parts?: string[]) => void }) {
  const tab = parts[0] || "built-in";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setPage("agents", ["built-in"])} className={`frost-btn !min-h-11 ${tab !== "custom" ? "frost-btn-frost" : ""}`}>Built-in (14)</button>
        <button onClick={() => setPage("agents", ["custom"])} className={`frost-btn !min-h-11 ${tab === "custom" ? "frost-btn-frost" : ""}`}>Custom</button>
      </div>
      {tab === "custom" ? <CustomPane /> : <BuiltIn />}
      <FrostCard title="MCP + A2A" subtitle="25 tools · stdio / SSE / Streamable HTTP">
        <div className="flex flex-wrap gap-1.5">
          {MCP_TOOLS.map((t) => <Badge key={t}>{t}</Badge>)}
        </div>
        <pre className="mt-3 overflow-auto rounded-lg bg-black/40 p-3 font-mono text-[10px] text-blue-100/75">{`{
  "mcpServers": {
    "zesrouter": {
      "command": "zesrouter",
      "args": ["mcp", "--transport", "stdio"]
    }
  }
}`}</pre>
        <p className="mt-2 text-[11px] text-white/40">A2A: JSON-RPC skills, streaming, task lifecycle — endpoint /a2a on the daemon when enabled.</p>
      </FrostCard>
    </div>
  );
}

function BuiltIn() {
  const { agents, providers } = useStore();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {BUILTIN_AGENTS.map((a) => {
        const st = agents.find((x) => x.id === a.id);
        const fp = fingerprint(a.binary, providers.map((p) => p.id));
        return (
          <FrostCard key={a.id} title={a.name} subtitle={a.binary} icon={<Bot size={16} />}
            action={<Badge variant={st?.installed ? "green" : "orange"}>{st?.installed ? `v${st.version || "?"}` : "Not Found"}</Badge>}
          >
            <div className="flex flex-wrap gap-1.5">
              <Badge>{a.protocol}</Badge>
              <Badge variant="neutral">{a.versionCmd}</Badge>
            </div>
            <p className="mt-2 text-[11px] text-white/40">CLI fingerprint: <span className="font-mono text-blue-200/70">{fp}</span></p>
            <p className="mt-1 font-mono text-[10px] text-white/30">spawn {a.binary} {a.spawnArgs.join(" ")}</p>
          </FrostCard>
        );
      })}
    </div>
  );
}

function CustomPane() {
  const { dash } = useStore();
  const [name, setName] = useState("");
  const [binary, setBinary] = useState("");
  const [versionCmd, setVersionCmd] = useState("");
  const [spawnArgs, setSpawnArgs] = useState("");

  function add() {
    if (!name.trim() || !binary.trim()) return;
    saveDash({
      customAgents: [
        { id: `ag-${Date.now().toString(36)}`, name: name.trim(), binary: binary.trim(), versionCmd: versionCmd.trim() || `${binary} --version`, spawnArgs },
        ...dash.customAgents,
      ],
    });
    setName("");
    setBinary("");
    setVersionCmd("");
    setSpawnArgs("");
  }

  return (
    <>
      <FrostCard variant="blue-bg" title="Register custom agent" icon={<Plus size={16} />}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name" className="frost-input" />
          <input value={binary} onChange={(e) => setBinary(e.target.value)} placeholder="binary" className="frost-input" />
          <input value={versionCmd} onChange={(e) => setVersionCmd(e.target.value)} placeholder="version command" className="frost-input" />
          <input value={spawnArgs} onChange={(e) => setSpawnArgs(e.target.value)} placeholder="spawn args" className="frost-input" />
        </div>
        <button onClick={add} className="frost-btn frost-btn-frost mt-3"><Plus size={13} /> Register</button>
      </FrostCard>
      {dash.customAgents.length === 0 ? <EmptyState text="No custom agents yet." /> : dash.customAgents.map((a) => (
        <FrostCard key={a.id} title={a.name} subtitle={a.binary}
          action={<button className="frost-btn frost-btn-destructive" onClick={() => saveDash({ customAgents: dash.customAgents.filter((x) => x.id !== a.id) })}><Trash2 size={13} /></button>}
        >
          <p className="font-mono text-[11px] text-white/50">{a.versionCmd} · {a.spawnArgs || "(no args)"}</p>
        </FrostCard>
      ))}
    </>
  );
}

function fingerprint(binary: string, providerIds: string[]) {
  const hit = providerIds.find((p) => binary.includes(p) || p.includes(binary.replace(/-cli$/, "")));
  return hit ? `${binary}↔${hit}` : `${binary}↔generic`;
}
