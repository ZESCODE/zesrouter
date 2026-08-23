import { useSyncExternalStore } from "react";
import { applyAppearance } from "./appearance";
import type {
  AgentStatus,
  Backup,
  Combo,
  CostStats,
  CustomAgent,
  DashboardState,
  DashSettings,
  HealthMetrics,
  HealthState,
  LogLine,
  ModelRoute,
  OmniRouteState,
  PolicyTable,
  ProviderConfig,
  ProviderTestResult,
  RequestRecord,
  SSEEvent,
  VirtualKey,
  Webhook,
} from "./types";
import { defaultDashboardState } from "./types";

interface StoreState {
  health: HealthState;
  daemonRunning: boolean;
  requests: RequestRecord[];
  keys: VirtualKey[];
  omniroute: OmniRouteState;
  sseEvents: SSEEvent[];
  sseConnected: boolean;
  startedAt: number;
  models: ModelRoute[];
  providers: ProviderConfig[];
  policy: PolicyTable | null;
  config: string | null;
  backups: Backup[];
  costs: CostStats | null;
  logs: LogLine[];
  logUpdatedAt: number;
  prevErrors: Set<string>;
  dash: DashboardState;
  metrics: HealthMetrics | null;
  agents: AgentStatus[];
}

export const TOKEN_KEY = "zesrouter_ui_token";

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setToken(tok: string) {
  try {
    localStorage.setItem(TOKEN_KEY, tok);
  } catch {
    /* ignore */
  }
}

export function authEvent(): void {
  window.dispatchEvent(new CustomEvent("zesrouter:unauthorized"));
}

export async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const tok = getToken();
  const headers = new Headers(init?.headers);
  if (tok) headers.set("Authorization", `Bearer ${tok}`);
  const r = await fetch(path, { ...init, headers });
  if (r.status === 401) {
    authEvent();
    throw new Error("HTTP 401");
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

function healthOf(up: boolean, models: number, listen: string, pid: number): HealthState {
  return {
    status: up ? "ok" : "down",
    pid,
    listen: listen || "0.0.0.0:4356",
    models,
    configName: "bitrouter.yaml",
    lastCheck: new Date().toISOString(),
    daemonRunning: up,
  };
}

const state: StoreState = {
  health: healthOf(false, 0, "", 0),
  daemonRunning: false,
  requests: [],
  keys: [],
  omniroute: {
    reachable: false,
    uptime_sec: 0,
    active_connections: 0,
    circuit_breakers: [],
    proxy_pool: { total: 0, active: 0, rotation_interval_sec: 0 },
    cache: { size_mb: 0, ttl_sec: 0, hit_ratio: 0, evictions: 0 },
  },
  sseEvents: [],
  sseConnected: true,
  startedAt: Date.now(),
  models: [],
  providers: [],
  policy: null,
  config: null,
  backups: [],
  costs: null,
  logs: [],
  logUpdatedAt: 0,
  prevErrors: new Set<string>(),
  dash: defaultDashboardState(),
  metrics: null,
  agents: [],
};

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): StoreState {
  return state;
}

let started = false;

async function refreshHealth() {
  try {
    const [h, s] = await Promise.all([
      getJSON<{ status: string }>("/api/health"),
      getJSON<{ daemonRunning: boolean; status: { running?: boolean; pid?: number; listen?: string; models?: number } }>("/api/status"),
    ]);
    const up = h.status === "ok" && s.daemonRunning;
    state.health = healthOf(up, s.status.models ?? 0, s.status.listen ?? "", s.status.pid ?? 0);
    state.daemonRunning = up;
    state.omniroute = { ...state.omniroute, reachable: up };
  } catch {
    state.health = healthOf(false, 0, "", 0);
    state.daemonRunning = false;
    state.omniroute = { ...state.omniroute, reachable: false };
  }
  emit();
}

async function refreshRequests() {
  try {
    const r = await getJSON<{
      ok: boolean;
      total: number;
      cost_sum: number;
      rows: RequestRecord[];
    }>("/api/requests?hours=24&page_size=500");
    if (!r.ok) return;
    state.requests = r.rows;
    state.omniroute = {
      ...state.omniroute,
      active_connections: Math.min(999, r.total),
      uptime_sec: Math.floor((Date.now() - state.startedAt) / 1000),
      circuit_breakers: state.providers.map((p) => {
        const per = state.requests.filter((q) => q.provider_id === p.id);
        const errs = per.filter((q) => q.error).length;
        const last = per.find((q) => q.error)?.created_at ?? null;
        const cool = state.dash.cooldown[p.id];
        return {
          provider_id: p.id,
          state: (errs > (state.dash.settings.resilience.cbFailures || 5) ? "open" : errs > 0 ? "half-open" : "closed") as "open" | "half-open" | "closed",
          failure_count: errs,
          last_failure_at: last,
          cooldown_until: cool ?? null,
          lockout_models: state.dash.lockout[p.id] ?? [],
        };
      }),
    };
  } catch {
    /* keep */
  }
  emit();
}

async function refreshKeys() {
  try {
    const r = await getJSON<{ ok: boolean; keys: VirtualKey[] }>("/api/keys");
    if (r.ok) state.keys = r.keys;
  } catch {
    /* keep */
  }
  emit();
}

async function refreshCatalog() {
  try {
    const [m, p, pol] = await Promise.all([
      getJSON<{ ok: boolean; models: ModelRoute[] }>("/api/models"),
      getJSON<{ ok: boolean; providers: ProviderConfig[] }>("/api/providers"),
      getJSON<{ ok: boolean; policy: PolicyTable }>("/api/policy"),
    ]);
    if (m.ok) state.models = m.models;
    if (p.ok) state.providers = p.providers;
    if (pol.ok) state.policy = pol.policy;
  } catch {
    /* keep */
  }
  emit();
}

async function refreshConfig() {
  try {
    const [c, b] = await Promise.all([
      getJSON<{ ok: boolean; yaml: string }>("/api/config"),
      getJSON<{ ok: boolean; backups: Backup[] }>("/api/backups"),
    ]);
    if (c.ok) state.config = c.yaml;
    if (b.ok) state.backups = b.backups;
  } catch {
    /* keep */
  }
  emit();
}

async function refreshCosts() {
  try {
    const r = await getJSON<{ ok: boolean } & CostStats>("/api/stats/costs");
    if (r.ok) {
      state.costs = {
        byProvider: r.byProvider ?? [],
        byModel: r.byModel ?? [],
        daily: r.daily ?? [],
      };
    }
  } catch {
    /* keep */
  }
  emit();
}

async function refreshLogs() {
  try {
    const r = await getJSON<{ ok: boolean; lines: LogLine[] }>("/api/logs?lines=300");
    if (r.ok) {
      state.logs = r.lines;
      state.logUpdatedAt = Date.now();
    }
  } catch {
    /* keep */
  }
  emit();
}

async function refreshEvents() {
  if (!state.sseConnected || !state.daemonRunning) return;
  try {
    const r = await getJSON<{ ok: boolean; recent_errors: { request_id: string; model_id: string; error: string; created_at: string }[] }>("/api/stats/dashboard");
    if (!r.ok) return;
    const fresh = (r.recent_errors || []).filter((e) => !state.prevErrors.has(e.request_id));
    if (fresh.length) {
      const events: SSEEvent[] = fresh.map((e) => ({
        id: e.request_id,
        ts: e.created_at,
        type: "error" as const,
        message: `[${e.model_id || "?"}] ${e.error.slice(0, 120)}`,
      }));
      state.sseEvents = [...events.reverse(), ...state.sseEvents].slice(0, 200);
      fresh.forEach((e) => state.prevErrors.add(e.request_id));
    }
  } catch {
    /* keep */
  }
  emit();
}

async function refreshDash() {
  try {
    const r = await getJSON<{ ok: boolean; state: DashboardState }>("/api/dash/state");
    if (r.ok && r.state) {
      state.dash = { ...defaultDashboardState(), ...r.state, settings: { ...defaultDashboardState().settings, ...(r.state.settings || {}) } };
      applyAppearance(state.dash.settings.appearance);
    }
  } catch {
    applyAppearance(state.dash.settings.appearance);
  }
  emit();
}

async function refreshMetrics() {
  try {
    const r = await getJSON<{ ok: boolean } & HealthMetrics>("/api/health/metrics");
    if (r.ok) state.metrics = r;
  } catch {
    /* keep */
  }
  emit();
}

async function refreshAgents() {
  try {
    const r = await getJSON<{ ok: boolean; agents: AgentStatus[] }>("/api/agents");
    if (r.ok) state.agents = r.agents;
  } catch {
    /* keep */
  }
  emit();
}

export async function saveDash(patch: Partial<DashboardState>) {
  state.dash = { ...state.dash, ...patch };
  if (patch.settings) applyAppearance(state.dash.settings.appearance);
  emit();
  try {
    await getJSON("/api/dash/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: state.dash }),
    });
  } catch {
    /* keep local */
  }
}

export async function saveSettings(settings: DashSettings) {
  await saveDash({ settings });
}

export function startEngine() {
  if (started) return;
  started = true;
  refreshHealth();
  refreshRequests();
  refreshKeys();
  refreshCatalog();
  refreshConfig();
  refreshCosts();
  refreshLogs();
  refreshEvents();
  refreshDash();
  refreshMetrics();
  refreshAgents();
  setInterval(refreshHealth, 10_000);
  setInterval(refreshRequests, 15_000);
  setInterval(refreshKeys, 30_000);
  setInterval(refreshCatalog, 60_000);
  setInterval(refreshConfig, 30_000);
  setInterval(refreshCosts, 60_000);
  setInterval(refreshLogs, 5_000);
  setInterval(refreshEvents, 5_000);
  setInterval(refreshMetrics, 20_000);
  setInterval(refreshAgents, 60_000);
}

export async function setDaemonRunning(running: boolean) {
  try {
    await getJSON("/api/daemon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: running ? "start" : "stop" }),
    });
    await refreshHealth();
  } catch {
    /* keep */
  }
}

export async function toggleSSE(connected: boolean) {
  state.sseConnected = connected;
  emit();
}

export async function reloadDaemon() {
  try {
    await getJSON("/api/daemon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reload" }),
    });
    await refreshHealth();
  } catch {
    /* keep */
  }
}

export async function createKey(label: string): Promise<VirtualKey & { plaintext?: string }> {
  const r = await getJSON<{ ok: boolean; result: { plaintext?: string; secret?: string; key?: string; id?: string } }>("/api/keys/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
  await refreshKeys();
  const pt = r.result.plaintext ?? r.result.secret ?? r.result.key ?? "";
  const rid = r.result.id ?? "";
  return { id: rid, key_hash: pt ? pt.slice(0, 12) + "…" : "", label, user_id: label, spend_limit_micro_usd: 0, rpm_limit: 0, policy_id: "default", expires_at: null, active: true, created_at: new Date().toISOString(), plaintext: pt };
}

export async function revokeKey(idToRevoke: string) {
  await getJSON("/api/keys/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: idToRevoke }),
  });
  await refreshKeys();
}

export async function setProviderKey(providerId: string, key: string | null): Promise<{ ok: boolean; error?: string; message?: string }> {
  const r = await getJSON<{ ok: boolean; error?: string; message?: string }>("/api/providers/key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerId, action: key === null ? "clear" : "set", key }),
  });
  await refreshCatalog();
  return r;
}

export async function addProvider(data: { id: string; displayName: string; apiBase: string; authEnv: string; enabled?: boolean }): Promise<{ ok: boolean; error?: string; message?: string }> {
  const r = await getJSON<{ ok: boolean; error?: string; message?: string }>("/api/providers/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  await refreshCatalog();
  return r;
}

export async function removeProvider(providerId: string): Promise<{ ok: boolean; error?: string; message?: string }> {
  const r = await getJSON<{ ok: boolean; error?: string; message?: string }>("/api/providers/remove", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: providerId }),
  });
  await refreshCatalog();
  return r;
}

export async function restartDaemon() {
  try {
    await getJSON("/api/daemon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restart" }),
    });
  } catch {
    /* keep */
  }
  setTimeout(refreshHealth, 2000);
  setTimeout(refreshHealth, 10000);
  setTimeout(refreshHealth, 25000);
}

export async function createBackup(): Promise<{ ok: boolean; created?: string[]; error?: string }> {
  const r = await getJSON<{ ok: boolean; created?: string[]; error?: string }>("/api/backups/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  await refreshConfig();
  return r;
}

export async function restoreBackup(name: string) {
  await getJSON("/api/backups/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  await refreshConfig();
}

export async function testProvider(providerId: string): Promise<ProviderTestResult> {
  try {
    const r = await getJSON<{ ok: boolean; error?: string } & ProviderTestResult>("/api/providers/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId }),
    });
    return r;
  } catch (e) {
    return { ok: false, providerId, detail: String(e) };
  }
}

export async function repairOAuth(providerId: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  return getJSON("/api/oauth/repair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerId }),
  });
}

export async function applyCliTool(toolId: string, action: "apply" | "reset"): Promise<{ ok: boolean; preview?: string; message?: string; error?: string }> {
  return getJSON("/api/cli-tools", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolId, action }),
  });
}

export function authHeaders(): HeadersInit {
  const tok = getToken();
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export type { Combo, CustomAgent, Webhook };
