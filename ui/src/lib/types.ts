// ZESRouter Control Panel — shared types
// Mirrors the API contract described in BUILD_PROMPT.md (server.py endpoints),
// implemented here as a self-contained, in-browser simulation of the daemon.

export type Tier = "cheap" | "flagship";

export interface ModelRoute {
  id: string;
  providers: string[]; // fallback chain, in order
  tier: Tier;
}

export interface ProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
  apiBase?: string;
  authEnvVar: string;
  hasKey: boolean;
}

export interface RequestRecord {
  request_id: string;
  user_id: string;
  api_key_id: string;
  model_id: string;
  provider_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  estimated_charge_micro_usd: number;
  streamed: boolean;
  latency_ms: number;
  generation_time_ms: number;
  error: string | null;
  created_at: string; // RFC3339
}

export interface VirtualKey {
  id: string;
  key_hash: string;
  label: string;
  user_id: string;
  spend_limit_micro_usd: number;
  rpm_limit: number;
  policy_id: string;
  expires_at: string | null;
  active: boolean;
  created_at: string;
}

export interface PolicyTable {
  tiers: Record<Tier, string>;
  fingerprints: { state: string; tier: Tier }[];
  default_tier: Tier;
  tool_use_tier: Tier;
  adequacy: { enabled: boolean; escalation_tier: Tier };
}

export interface CircuitBreaker {
  provider_id: string;
  state: "closed" | "open" | "half-open";
  failure_count: number;
  last_failure_at: string | null;
}

export interface OmniRouteState {
  reachable: boolean;
  uptime_sec: number;
  active_connections: number;
  circuit_breakers: CircuitBreaker[];
  proxy_pool: { total: number; active: number; rotation_interval_sec: number };
  cache: { size_mb: number; ttl_sec: number; hit_ratio: number; evictions: number };
}

export type SSEEventType =
  | "request"
  | "route"
  | "failover"
  | "error"
  | "cache_hit"
  | "cache_miss";

export interface SSEEvent {
  id: string;
  ts: string;
  type: SSEEventType;
  message: string;
}

export interface HealthState {
  status: "ok" | "degraded" | "down";
  pid: number;
  listen: string;
  models: number;
  configName: string;
  lastCheck: string;
  daemonRunning: boolean;
}

export interface Backup {
  name: string;
  mtime: string;
}

export interface CostRow {
  provider_id?: string;
  model_id?: string;
  requests: number;
  cost_micro: number;
  avg_latency_ms?: number | null;
}

export interface DailyCost {
  day: string;
  requests: number;
  cost_micro: number;
  errors: number;
}

export interface CostStats {
  byProvider: CostRow[];
  byModel: CostRow[];
  daily: DailyCost[];
}

export interface LogLine {
  ts: string;
  level: string;
  target: string;
  msg: string;
}

export interface ProviderTestResult {
  ok: boolean;
  providerId: string;
  model?: string;
  latencyMs?: number;
  status?: number;
  detail?: string;
}
