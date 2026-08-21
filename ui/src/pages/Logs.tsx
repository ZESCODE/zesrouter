import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollText, Filter, TerminalSquare } from "lucide-react";
import GlassCard from "../components/ui/GlassCard";
import Badge from "../components/ui/Badge";
import { useStore } from "../lib/store";
import { EmptyState } from "./Dashboard";

type LevelFilter = "all" | "debug" | "info" | "warn" | "error";

const LEVELS: { id: LevelFilter; label: string; badge: "orange" | "red" | "cyan" | "neutral" | "blue" }[] = [
  { id: "all", label: "all", badge: "blue" },
  { id: "debug", label: "debug", badge: "neutral" },
  { id: "info", label: "info", badge: "cyan" },
  { id: "warn", label: "warn", badge: "orange" },
  { id: "error", label: "error", badge: "red" },
];

function levelColor(level: string): string {
  switch (level.toUpperCase()) {
    case "ERROR":
      return "text-red-400";
    case "WARN":
      return "text-orange-400";
    case "INFO":
      return "text-cyan-300";
    case "DEBUG":
      return "text-white/30";
    default:
      return "text-white/50";
  }
}

export default function Logs() {
  const { logs, logUpdatedAt } = useStore();
  const [filter, setFilter] = useState<LevelFilter>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(
    () => (filter === "all" ? logs : logs.filter((l) => l.level.toUpperCase() === filter.toUpperCase())),
    [logs, filter],
  );

  useEffect(() => {
    if (autoScroll && scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [filtered.length, autoScroll]);

  const ago = logUpdatedAt ? Math.max(0, Math.round((Date.now() - logUpdatedAt) / 1000)) : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <GlassCard variant="blue" title="Daemon log" subtitle="polled every 5s · newest at bottom" icon={<ScrollText size={16} />}
        action={
          <button
            onClick={() => setAutoScroll((v) => !v)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs active:scale-95 ${autoScroll ? "border-blue-400/30 bg-blue-500/15 text-blue-300" : "border-white/10 bg-white/5 text-white/50"}`}
          >
            auto-scroll {autoScroll ? "on" : "off"}
          </button>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Filter size={13} className="text-white/35" />
          {LEVELS.map((l) => (
            <button
              key={l.id}
              onClick={() => setFilter(l.id)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition active:scale-95 ${filter === l.id ? "border-blue-400/30 bg-blue-500/15 text-blue-300" : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10"}`}
            >
              {l.id === "all" ? "all" : <Badge variant={l.badge}>{l.label}</Badge>}
            </button>
          ))}
          <span className="ml-auto text-xs text-white/35">{filtered.length} lines</span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState text="No log lines yet — daemon may be down (see ~/logs/bitrouter/bitrouter.log)." />
        ) : (
          <div
            ref={scrollerRef}
            className="max-h-[60vh] overflow-y-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed"
          >
            {filtered.map((l, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                <span className="text-white/35">{l.ts}</span>{" "}
                <span className={levelColor(l.level)}>[{l.level}]</span>{" "}
                <span className="text-white/45">{l.target}</span>{" "}
                <span className="text-white/70">{l.msg}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 text-[11px] text-white/40">
          <Badge variant="green" dot>live</Badge>
          <span>updated {ago}s ago</span>
          <span>·</span>
          <span>{logs.length} total lines</span>
          <TerminalSquare size={12} className="ml-auto text-white/25" />
        </div>
      </GlassCard>
    </div>
  );
}