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
  Wallet,
  FileClock,
  ScrollText,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

export type PageId =
  | "dashboard"
  | "models"
  | "providers"
  | "policy"
  | "keys"
  | "traffic"
  | "costs"
  | "logs"
  | "backups"
  | "router"
  | "settings"
  | "health"
  | "events";

export interface NavItem {
  id: PageId;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
  { id: "models", label: "Models / Routing", shortLabel: "Models", icon: Route },
  { id: "providers", label: "Providers", shortLabel: "Providers", icon: Server },
  { id: "policy", label: "Policy", shortLabel: "Policy", icon: ShieldCheck },
  { id: "keys", label: "Virtual API Keys", shortLabel: "Keys", icon: KeyRound },
  { id: "traffic", label: "Traffic / Request Log", shortLabel: "Traffic", icon: Activity },
  { id: "costs", label: "Costs / Usage", shortLabel: "Costs", icon: Wallet },
  { id: "logs", label: "Daemon Logs", shortLabel: "Logs", icon: ScrollText },
  { id: "backups", label: "Backups", shortLabel: "Backups", icon: FileClock },
  { id: "router", label: "Routing Editor", shortLabel: "Editor", icon: SlidersHorizontal },
  { id: "settings", label: "Settings", shortLabel: "Settings", icon: Settings },
  { id: "health", label: "System Health", shortLabel: "Health", icon: HeartPulse },
  { id: "events", label: "Live Event Stream", shortLabel: "Events", icon: Radio },
];
