import {
  LayoutDashboard,
  Route,
  Server,
  ShieldCheck,
  KeyRound,
  Activity,
  Settings,
  HeartPulse,
  Radio,
  FileClock,
  ScrollText,
  SlidersHorizontal,
  Layers3,
  BarChart3,
  Play,
  Languages,
  Bot,
  Terminal,
  Shuffle,
  Gift,
  type LucideIcon,
} from "lucide-react";

export type PageId =
  | "dashboard"
  | "providers"
  | "combos"
  | "analytics"
  | "health"
  | "playground"
  | "translator"
  | "agents"
  | "cli-tools"
  | "context"
  | "free-tiers"
  | "settings"
  | "logs"
  | "keys"
  | "traffic"
  | "policy"
  | "backups"
  | "models"
  | "events"
  | "router";

export interface NavItem {
  id: PageId;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  group: "overview" | "routing" | "studio" | "ops" | "system";
}

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard, group: "overview" },
  { id: "health", label: "System Health", shortLabel: "Health", icon: HeartPulse, group: "overview" },
  { id: "analytics", label: "Analytics", shortLabel: "Stats", icon: BarChart3, group: "overview" },
  { id: "providers", label: "Providers", shortLabel: "Providers", icon: Server, group: "routing" },
  { id: "combos", label: "Combos", shortLabel: "Combos", icon: Layers3, group: "routing" },
  { id: "models", label: "Models", shortLabel: "Models", icon: Route, group: "routing" },
  { id: "policy", label: "Policy", shortLabel: "Policy", icon: ShieldCheck, group: "routing" },
  { id: "router", label: "Routing Editor", shortLabel: "Editor", icon: SlidersHorizontal, group: "routing" },
  { id: "playground", label: "Playground", shortLabel: "Play", icon: Play, group: "studio" },
  { id: "translator", label: "Translator", shortLabel: "Xlat", icon: Languages, group: "studio" },
  { id: "agents", label: "ACP Agents", shortLabel: "Agents", icon: Bot, group: "studio" },
  { id: "cli-tools", label: "CLI + Webhooks", shortLabel: "CLI", icon: Terminal, group: "studio" },
  { id: "context", label: "Context Relay", shortLabel: "Relay", icon: Shuffle, group: "studio" },
  { id: "free-tiers", label: "Free Tiers", shortLabel: "Free", icon: Gift, group: "studio" },
  { id: "traffic", label: "Traffic", shortLabel: "Traffic", icon: Activity, group: "ops" },
  { id: "keys", label: "Virtual Keys", shortLabel: "Keys", icon: KeyRound, group: "ops" },
  { id: "logs", label: "Logs", shortLabel: "Logs", icon: ScrollText, group: "ops" },
  { id: "events", label: "Live Events", shortLabel: "Live", icon: Radio, group: "ops" },
  { id: "backups", label: "Backups", shortLabel: "Backups", icon: FileClock, group: "ops" },
  { id: "settings", label: "Settings", shortLabel: "Settings", icon: Settings, group: "system" },
];

export const NAV_GROUPS: { id: NavItem["group"]; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "routing", label: "Routing" },
  { id: "studio", label: "Studio" },
  { id: "ops", label: "Ops" },
  { id: "system", label: "System" },
];

export const MOBILE_PRIMARY: PageId[] = ["dashboard", "providers", "combos", "playground"];

export const ALL_PAGE_IDS: PageId[] = NAV_ITEMS.map((n) => n.id);

export interface RouteState {
  page: PageId;
  parts: string[];
}

export function parseHash(): RouteState {
  const raw = window.location.hash.replace(/^#\/?/, "").trim();
  const segs = raw.split("/").filter(Boolean);
  const page = (segs[0] || "dashboard") as PageId;
  if (!ALL_PAGE_IDS.includes(page)) return { page: "dashboard", parts: [] };
  return { page, parts: segs.slice(1) };
}

export function toHash(page: PageId, parts: string[] = []): string {
  return `#${[page, ...parts].join("/")}`;
}
