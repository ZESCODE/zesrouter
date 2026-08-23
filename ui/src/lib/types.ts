export type Tier = "cheap" | "flagship";

export interface ModelRoute {
  id: string;
  providers: string[];
  tier: Tier | null;
}

export interface ProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
  apiBase?: string;
  authEnvVar: string;
  hasKey: boolean;
  requests?: number;
  errors?: number;
  errorRate?: number;
  avgLatency?: number | null;
  cost?: number;
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
  created_at: string;
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
  plaintext?: string;
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
  cooldown_until?: string | null;
  lockout_models?: string[];
}

export interface OmniRouteState {
  reachable: boolean;
  uptime_sec: number;
  active_connections: number;
  circuit_breakers: CircuitBreaker[];
  proxy_pool: { total: number; active: number; rotation_interval_sec: number };
  cache: { size_mb: number; ttl_sec: number; hit_ratio: number; evictions: number };
}

export type SSEEventType = "request" | "route" | "failover" | "error" | "cache_hit" | "cache_miss";

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
  prompt_tokens?: number;
  completion_tokens?: number;
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
  error?: string;
}

export interface ComboStep {
  provider: string;
  model: string;
  connection: string;
}

export interface Combo {
  id: string;
  name: string;
  strategy: string;
  steps: ComboStep[];
  defaultTier: "cheap" | "flagship";
  fallbackTier: "cheap" | "flagship";
  enabled: boolean;
  createdAt: string;
}

export interface CustomAgent {
  id: string;
  name: string;
  binary: string;
  versionCmd: string;
  spawnArgs: string;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
}

export interface ContextRelayConfig {
  enabled: boolean;
  handoffThreshold: number;
  maxMessages: number;
  summaryModel: string;
  injectAsSystem: boolean;
}

export interface AppearanceSettings {
  theme: "dark" | "light" | "system";
  accent: string;
  customHex: string;
  showHealthLog: boolean;
  sidebar: "auto" | "visible" | "hidden";
}

export interface SecuritySettings {
  protectEndpoint: boolean;
  blockedProviders: string[];
  ipAllow: string;
  ipDeny: string;
}

export interface ResilienceSettings {
  persistRateLimits: boolean;
  cbFailures: number;
  cbCooldownSec: number;
  autoDisableBanned: boolean;
  watchExpiration: boolean;
  relayThreshold: number;
}

export interface DashSettings {
  appearance: AppearanceSettings;
  security: SecuritySettings;
  resilience: ResilienceSettings;
  aliases: Record<string, string>;
  degradeBackground: boolean;
  fallbackDegrade: boolean;
  auditEnabled: boolean;
  proxyUrl: string;
  proxyEnforce: boolean;
  tokenHealthCheck: boolean;
  oauthRefresh: boolean;
  compressionDefault: string;
  compressionLevel: number;
}

export interface HealthMetrics {
  p50: number;
  p95: number;
  p99: number;
  cacheHit: number;
  cacheRead: number;
  cacheWrite: number;
  quotaSessions: number;
  memoryMb: number;
  version: string;
}

export interface AgentStatus {
  id: string;
  installed: boolean;
  version: string | null;
  fingerprint?: string;
}

export interface DashboardState {
  combos: Combo[];
  hiddenModels: Record<string, string[]>;
  customAgents: CustomAgent[];
  webhooks: Webhook[];
  context: ContextRelayConfig;
  settings: DashSettings;
  freeEnabled: Record<string, boolean>;
  cooldown: Record<string, string>;
  lockout: Record<string, string[]>;
}

export function defaultDashSettings(): DashSettings {
  return {
    appearance: { theme: "dark", accent: "blue", customHex: "#3b82f6", showHealthLog: true, sidebar: "auto" },
    security: { protectEndpoint: true, blockedProviders: [], ipAllow: "", ipDeny: "" },
    resilience: { persistRateLimits: true, cbFailures: 5, cbCooldownSec: 30, autoDisableBanned: true, watchExpiration: true, relayThreshold: 85 },
    aliases: {},
    degradeBackground: true,
    fallbackDegrade: true,
    auditEnabled: true,
    proxyUrl: "",
    proxyEnforce: false,
    tokenHealthCheck: true,
    oauthRefresh: true,
    compressionDefault: "rtk",
    compressionLevel: 2,
  };
}

export function defaultContext(): ContextRelayConfig {
  return { enabled: true, handoffThreshold: 85, maxMessages: 24, summaryModel: "", injectAsSystem: true };
}

export function defaultDashboardState(): DashboardState {
  return {
    combos: [],
    hiddenModels: {},
    customAgents: [],
    webhooks: [],
    context: defaultContext(),
    settings: defaultDashSettings(),
    freeEnabled: {},
    cooldown: {},
    lockout: {},
  };
}
