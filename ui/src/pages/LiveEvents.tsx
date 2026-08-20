import { useEffect, useRef, useState } from "react";
import { Radio, Pause, Play, Trash2 } from "lucide-react";
import GlassCard from "../components/ui/GlassCard";
import Badge from "../components/ui/Badge";
import Sparkline from "../components/ui/Sparkline";
import { useStore, toggleSSE } from "../lib/store";
import type { SSEEventType } from "../lib/types";
import { localTime } from "../lib/format";
import { EmptyState } from "./Dashboard";
import type { FrostVariant } from "../components/ui/GlassCard";

const TYPE_VARIANT: Record<SSEEventType, FrostVariant> = {
  request: "blue",
  route: "green",
  failover: "orange",
  error: "red",
  cache_hit: "cyan",
  cache_miss: "purple",
};

const ALL_TYPES: SSEEventType[] = ["request", "route", "failover", "error", "cache_hit", "cache_miss"];

export default function LiveEvents() {
  const { sseEvents, sseConnected } = useStore();
  const [autoScroll, setAutoScroll] = useState(true);
  const [typeFilter, setTypeFilter] = useState<Set<SSEEventType>>(new Set(ALL_TYPES));
  const [cleared, setCleared] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const visible = sseEvents.slice(0, sseEvents.length - cleared >= 0 ? sseEvents.length : 0).filter((e) => typeFilter.has(e.type));

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sseEvents, autoScroll]);

  // events-per-minute over last hour (60 buckets)
  const now = Date.now();
  const buckets = new Array(60).fill(0);
  for (const e of sseEvents) {
    const age = now - new Date(e.ts).getTime();
    const idx = 59 - Math.floor(age / 60000);
    if (idx >= 0 && idx < 60) buckets[idx]++;
  }

  function toggleType(t: SSEEventType) {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <GlassCard
        variant="purple"
        title="OmniRoute SSE Stream"
        subtitle="http://127.0.0.1:20128/api/mcp/sse"
        icon={<Radio size={16} />}
        action={
          <Badge variant={sseConnected ? "green" : "neutral"} dot>
            {sseConnected ? "connected" : "paused"}
          </Badge>
        }
      >
        <Sparkline values={buckets} color="#c084fc" width={600} height={44} />
        <p className="mt-1 text-[10px] text-white/30">events / minute · last 60 min</p>
      </GlassCard>

      <GlassCard variant="purple" title="Event Filters" icon={<Radio size={16} />}
        action={
          <div className="flex gap-2">
            <button
              onClick={() => toggleSSE(!sseConnected)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                sseConnected ? "border-orange-400/30 bg-orange-500/10 text-orange-300" : "border-green-400/30 bg-green-500/10 text-green-300"
              }`}
            >
              {sseConnected ? <Pause size={13} /> : <Play size={13} />}
              {sseConnected ? "Pause" : "Resume"}
            </button>
            <button
              onClick={() => setCleared(sseEvents.length)}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/50 hover:bg-white/5"
            >
              <Trash2 size={13} /> Clear
            </button>
          </div>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {ALL_TYPES.map((t) => (
            <button key={t} onClick={() => toggleType(t)} className={typeFilter.has(t) ? "" : "opacity-30"}>
              <Badge variant={TYPE_VARIANT[t]} dot>
                {t}
              </Badge>
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard variant="purple" title="Live Log" subtitle={`${visible.length} events buffered`} icon={<Radio size={16} />}
        action={
          <label className="flex items-center gap-1.5 text-[11px] text-white/40">
            <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className="accent-purple-400" />
            auto-scroll
          </label>
        }
      >
        <div className="max-h-[420px] overflow-y-auto rounded-lg border border-white/10 bg-black/40 p-2 font-mono">
          {visible.length === 0 ? (
            <EmptyState text={sseConnected ? "Waiting for events…" : "Stream paused."} />
          ) : (
            <div className="space-y-1">
              {[...visible].reverse().map((e) => (
                <div key={e.id} className="flex items-start gap-2 rounded px-1.5 py-1 text-[11px] hover:bg-white/[0.03]">
                  <span className="shrink-0 text-white/30">{localTime(e.ts)}</span>
                  <Badge variant={TYPE_VARIANT[e.type]} className="shrink-0">
                    {e.type}
                  </Badge>
                  <span className="min-w-0 break-words text-white/65">{e.message}</span>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
