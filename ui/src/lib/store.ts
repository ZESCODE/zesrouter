import { useSyncExternalStore } from "react";
import type {
  Backup,
  HealthState,
  ModelRoute,
  OmniRouteState,
  PolicyTable,
  ProviderConfig,
  RequestRecord,
  SSEEvent,
  VirtualKey,
} from "./types";

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
  prevErrors: Set<string>;
}

async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init);
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
  prevErrors: new Set<string>(),
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
      models: string[];
      providers: string[];
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
        return {
          provider_id: p.id,
          state: errs > 5 ? "open" : errs > 0 ? "half-open" : "closed",
          failure_count: errs,
          last_failure_at: per.find((q) => q.error)?.created_at ?? null,
        };
      }),
    };
  } catch {
    /* daemon down — keep last */
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

export function startEngine() {
  if (started) return;
  started = true;
  refreshHealth();
  refreshRequests();
  refreshKeys();
  refreshCatalog();
  refreshConfig();
  refreshEvents();
  setInterval(refreshHealth, 10_000);
  setInterval(refreshRequests, 15_000);
  setInterval(refreshKeys, 30_000);
  setInterval(refreshCatalog, 60_000);
  setInterval(refreshConfig, 30_000);
  setInterval(refreshEvents, 5_000);
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
  const r = await getJSON<{ ok: boolean; result: { plaintext?: string; key?: string } }>("/api/keys/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
  await refreshKeys();
  return { id: "", key_hash: r.result.key ?? "", label, user_id: label, spend_limit_micro_usd: 0, rpm_limit: 0, policy_id: "default", expires_at: null, active: true, created_at: new Date().toISOString(), plaintext: r.result.plaintext };
}

export async function revokeKey(idToRevoke: string) {
  await getJSON("/api/keys/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: idToRevoke }),
  });
  await refreshKeys();
}

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}