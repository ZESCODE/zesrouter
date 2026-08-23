import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, X, Wifi, WifiOff, Router } from "lucide-react";
import { MOBILE_PRIMARY, NAV_GROUPS, NAV_ITEMS, type PageId } from "../lib/nav";
import { cn } from "../utils/cn";
import { useStore } from "../lib/store";
import { timeAgo } from "../lib/format";
import Badge from "./ui/Badge";

export default function Layout({
  page,
  setPage,
  children,
}: {
  page: PageId;
  setPage: (p: PageId, parts?: string[]) => void;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { health } = useStore();
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [page]);

  const activeLabel = NAV_ITEMS.find((n) => n.id === page)?.label ?? "Dashboard";

  function onTouchStart(e: React.TouchEvent) {
    const t = e.changedTouches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (dx > 0 && t.clientX > 80) setDrawerOpen(true);
    if (dx < 0) setDrawerOpen(false);
  }

  return (
    <div className="min-h-screen bg-black text-white" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-blue-600/25 blur-3xl" />
        <div className="absolute top-1/3 -right-20 h-96 w-96 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-cyan-600/10 blur-3xl" />
      </div>

      <aside className="zr-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-blue-400/15 bg-[#050b16]/80 backdrop-blur-xl md:flex">
        <SidebarContent page={page} setPage={setPage} />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-blue-400/20 bg-black/95 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5">
              <Brand />
              <button onClick={() => setDrawerOpen(false)} className="rounded-lg border border-white/10 p-2 text-white/60 active:scale-95" aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            <SidebarContent page={page} setPage={setPage} hideBrand />
          </aside>
        </div>
      )}

      <div className="zr-main md:pl-64">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-blue-400/15 bg-black/70 px-3 py-3 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button onClick={() => setDrawerOpen(true)} className="rounded-lg border border-blue-400/20 p-2 text-white/70 active:scale-95 md:hidden" aria-label="Open menu">
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-white sm:text-lg">{activeLabel}</h1>
              <p className="hidden text-xs text-white/40 sm:block">ZESRouter · Frost Control Panel</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant={health.status === "ok" ? "green" : "red"} dot>
              {health.status === "ok" ? "Daemon Online" : "Daemon Down"}
            </Badge>
            <span className="hidden text-[11px] text-white/30 lg:inline">checked {timeAgo(health.lastCheck)}</span>
          </div>
        </header>

        <main className="relative z-10 px-3 py-4 pb-24 sm:px-6 sm:py-6 md:pb-6">{children}</main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-14 items-stretch border-t border-blue-400/20 bg-black/95 backdrop-blur-xl md:hidden">
        {MOBILE_PRIMARY.map((id) => {
          const item = NAV_ITEMS.find((n) => n.id === id)!;
          const Icon = item.icon;
          const active = page === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={cn(
                "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] leading-none transition-colors active:scale-95",
                active ? "text-blue-300" : "text-white/50 hover:text-white/80",
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 2} />
              <span className="mt-0.5">{item.shortLabel}</span>
            </button>
          );
        })}
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] leading-none text-white/50 hover:text-white/80 active:scale-95"
        >
          <Menu size={18} />
          <span className="mt-0.5">More</span>
        </button>
      </nav>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-400/40 bg-blue-500/15 shadow-[0_0_18px_-4px_rgba(59,130,246,0.9)]">
        <Router size={17} className="text-blue-300" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-bold tracking-tight text-white">ZESRouter</p>
        <p className="text-[10px] text-blue-300/60">Frost Control Panel</p>
      </div>
    </div>
  );
}

function SidebarContent({
  page,
  setPage,
  hideBrand,
}: {
  page: PageId;
  setPage: (p: PageId) => void;
  hideBrand?: boolean;
}) {
  const { health, omniroute, sseConnected } = useStore();
  return (
    <div className="flex h-full flex-col">
      {!hideBrand && (
        <div className="border-b border-blue-400/15 px-5 py-4">
          <Brand />
        </div>
      )}
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((g) => (
          <div key={g.id}>
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-blue-200/35">{g.label}</p>
            <div className="space-y-0.5">
              {NAV_ITEMS.filter((n) => n.group === g.id).map((item) => {
                const Icon = item.icon;
                const active = page === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setPage(item.id)}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                      active
                        ? "border border-blue-400/35 bg-blue-500/20 text-blue-200 shadow-[0_0_22px_-8px_rgba(59,130,246,0.95)]"
                        : "border border-transparent text-white/60 hover:bg-white/5 hover:text-white/90",
                    )}
                  >
                    <Icon size={16} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="space-y-2 border-t border-blue-400/15 px-4 py-4 text-[11px] text-white/40">
        <div className="flex items-center justify-between">
          <span>Daemon PID</span>
          <span className="font-mono text-white/60">{health.pid}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Listen</span>
          <span className="font-mono text-white/60">{health.listen}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Live stream</span>
          <span className={cn("flex items-center gap-1", sseConnected ? "text-green-400" : "text-red-400")}>
            {sseConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {sseConnected ? "live" : "off"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Connections</span>
          <span className="font-mono text-white/60">{omniroute.active_connections}</span>
        </div>
      </div>
    </div>
  );
}
