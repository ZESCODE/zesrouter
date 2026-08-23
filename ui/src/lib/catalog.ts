export type ProviderKind = "oauth" | "free-noauth" | "apikey" | "free";

export interface CatalogProvider {
  id: string;
  name: string;
  kind: ProviderKind;
  env?: string;
  models: string[];
  email?: string;
  credits?: number | null;
  notes: string;
  repairEnv?: string[];
}

export const CATALOG_PROVIDERS: CatalogProvider[] = [
  { id: "claude-code", name: "Claude Code", kind: "oauth", env: "ANTHROPIC_API_KEY", models: ["claude-opus-4", "claude-sonnet-5", "claude-haiku-4"], email: "di*****@a*****.com", notes: "OAuth via `claude` CLI", repairEnv: ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"] },
  { id: "codex", name: "Codex", kind: "oauth", env: "OPENAI_API_KEY", models: ["gpt-5.4", "o4-mini", "codex-mini"], email: "co*****@o*****.com", notes: "OAuth via Codex CLI", repairEnv: ["OPENAI_API_KEY", "CODEX_API_KEY"] },
  { id: "gemini-cli", name: "Gemini CLI", kind: "oauth", env: "GEMINI_API_KEY", models: ["gemini-2.5-pro", "gemini-2.5-flash"], email: "ge*****@g*****.com", notes: "Google OAuth / ADC", repairEnv: ["GEMINI_API_KEY", "GOOGLE_API_KEY"] },
  { id: "qoder", name: "Qoder", kind: "oauth", env: "QODER_TOKEN", models: ["qoder-default"], email: "qo*****@q*****.io", notes: "Qoder OAuth", repairEnv: ["QODER_TOKEN"] },
  { id: "opencode", name: "OpenCode Zen", kind: "free-noauth", models: ["muse-spark-1.2-contributor-free", "hy3-free", "mimo-v2.5-free", "nemotron-3-ultra-free", "big-pickle", "x-preview-f-free"], notes: "Keyless zen relay :7077" },
  { id: "arena", name: "Arena", kind: "free-noauth", models: ["arena/chat", "arena/image"], notes: "Local Arena catalog relay" },
  { id: "duckgo", name: "DuckGo", kind: "free-noauth", models: ["duckgo/gpt", "duckgo/claude", "duckgo/llama"], notes: "DuckDuckGo AI relay" },
  { id: "groq", name: "Groq", kind: "apikey", env: "GROQ_API_KEY", models: ["llama-3.3-70b", "mixtral-8x7b", "gemma2-9b"], notes: "Fast inference API key" },
  { id: "deepseek", name: "DeepSeek", kind: "apikey", env: "DEEPSEEK_API_KEY", models: ["deepseek-chat", "deepseek-reasoner"], notes: "DeepSeek official" },
  { id: "openrouter", name: "OpenRouter", kind: "apikey", env: "OPENROUTER_API_KEY", models: ["google/gemma-4-31b-it:free", "nvidia/nemotron-nano-12b-v2-vl:free"], notes: "Aggregator + free suffix" },
  { id: "nvidia", name: "NVIDIA NIM", kind: "apikey", env: "NVIDIA_API_KEY", models: ["z-ai/glm-5.2", "google/gemma-4-31b-it", "nvidia/nemotron-3-ultra-550b-a55b"], notes: "via :9456 bridge" },
  { id: "xai", name: "xAI", kind: "apikey", env: "XAI_API_KEY", models: ["grok-3", "grok-3-mini"], notes: "Grok API" },
  { id: "iflow", name: "iFlow", kind: "free", models: ["iflow/chat"], credits: 120, notes: "Free credits, balance tracked" },
  { id: "qwen", name: "Qwen", kind: "free", models: ["qwen-plus-free", "qwen-coder-free"], credits: 80, notes: "Qwen Cloud free window" },
  { id: "kiro", name: "Kiro", kind: "free", models: ["kiro/default"], credits: 40, notes: "Kiro credit balance" },
];

export const KIND_LABEL: Record<ProviderKind, string> = {
  oauth: "OAuth",
  "free-noauth": "Free · no OAuth",
  apikey: "API Key",
  free: "Free + credits",
};

export interface RouteStrategy {
  id: string;
  name: string;
  description: string;
}

export const STRATEGIES: RouteStrategy[] = [
  { id: "priority", name: "Priority", description: "Fixed priority order" },
  { id: "weighted", name: "Weighted", description: "Weighted random selection" },
  { id: "round-robin", name: "Round-robin", description: "Sequential distribution" },
  { id: "random", name: "Random", description: "Random selection" },
  { id: "least-used", name: "Least-used", description: "Least utilized provider" },
  { id: "cost-optimized", name: "Cost-optimized", description: "Cheapest healthy provider" },
  { id: "strict-random", name: "Strict-random", description: "True random, no weighting" },
  { id: "auto", name: "Auto", description: "6-factor weighted scoring" },
  { id: "fill-first", name: "Fill-first", description: "Maximize quota usage per provider" },
  { id: "p2c", name: "P2C", description: "Power of Two Choices" },
  { id: "lkgp", name: "LKGP", description: "Last Known Good Provider first" },
  { id: "context-optimized", name: "Context-optimized", description: "Task-aware routing" },
  { id: "context-relay", name: "Context-relay", description: "Session continuity on account rotation" },
  { id: "rules", name: "Rules", description: "quota · health · cost · latency · taskFit · stability" },
  { id: "cost", name: "Cost / Eco", description: "Cheapest healthy" },
  { id: "eco", name: "Eco", description: "Cheapest healthy (alias)" },
  { id: "latency", name: "Latency / Fast", description: "Lowest p95 with reliability penalty" },
  { id: "fast", name: "Fast", description: "Lowest p95 (alias)" },
  { id: "sla-aware", name: "SLA-aware", description: "p95 + error-rate + cost SLOs" },
];

export const COMPRESSION_ENGINES = [
  { id: "rtk", name: "RTK · Rapid Token Killer", savings: "15–95%", desc: "Filler, hedges, and restated instructions" },
  { id: "caveman", name: "Caveman", savings: "25–60%", desc: "Drop articles and compress grammar" },
  { id: "multiphase", name: "Multi-phase", savings: "30–80%", desc: "Whitespace → dedupe → synonym pipeline" },
  { id: "whitespace", name: "Whitespace", savings: "5–20%", desc: "Collapse runs and trim" },
  { id: "dedupe", name: "Dedupe", savings: "10–40%", desc: "Remove repeated sentences" },
  { id: "abbreviate", name: "Abbreviate", savings: "8–25%", desc: "Common phrase shortcuts" },
  { id: "json-minify", name: "JSON minify", savings: "10–35%", desc: "Compact structured payloads" },
  { id: "comment-strip", name: "Comment strip", savings: "5–30%", desc: "Remove # // /* */ comments" },
  { id: "synonym-short", name: "Synonym short", savings: "8–22%", desc: "Shorter everyday synonyms" },
  { id: "bullet-fold", name: "Bullet fold", savings: "12–35%", desc: "Fold list padding" },
  { id: "system-trim", name: "System trim", savings: "10–45%", desc: "Trim boilerplate system preambles" },
  { id: "hybrid", name: "Hybrid", savings: "20–90%", desc: "RTK + caveman + multiphase" },
];

export interface BuiltInAgent {
  id: string;
  name: string;
  binary: string;
  versionCmd: string;
  protocol: "stdio" | "http" | "both";
  spawnArgs: string[];
}

export const BUILTIN_AGENTS: BuiltInAgent[] = [
  { id: "codex", name: "Codex", binary: "codex", versionCmd: "codex --version", protocol: "stdio", spawnArgs: ["exec"] },
  { id: "claude", name: "Claude", binary: "claude", versionCmd: "claude --version", protocol: "stdio", spawnArgs: [] },
  { id: "goose", name: "Goose", binary: "goose", versionCmd: "goose --version", protocol: "stdio", spawnArgs: ["session"] },
  { id: "gemini-cli", name: "Gemini CLI", binary: "gemini", versionCmd: "gemini --version", protocol: "stdio", spawnArgs: [] },
  { id: "openclaw", name: "OpenClaw", binary: "openclaw", versionCmd: "openclaw --version", protocol: "both", spawnArgs: [] },
  { id: "aider", name: "Aider", binary: "aider", versionCmd: "aider --version", protocol: "stdio", spawnArgs: [] },
  { id: "opencode", name: "OpenCode", binary: "opencode", versionCmd: "opencode --version", protocol: "both", spawnArgs: [] },
  { id: "cline", name: "Cline", binary: "cline", versionCmd: "cline --version", protocol: "http", spawnArgs: [] },
  { id: "qwen-code", name: "Qwen Code", binary: "qwen", versionCmd: "qwen --version", protocol: "stdio", spawnArgs: [] },
  { id: "forgecode", name: "ForgeCode", binary: "forge", versionCmd: "forge --version", protocol: "stdio", spawnArgs: [] },
  { id: "amazon-q", name: "Amazon Q", binary: "q", versionCmd: "q --version", protocol: "stdio", spawnArgs: [] },
  { id: "open-interpreter", name: "Open Interpreter", binary: "interpreter", versionCmd: "interpreter --version", protocol: "stdio", spawnArgs: [] },
  { id: "cursor-cli", name: "Cursor CLI", binary: "cursor", versionCmd: "cursor --version", protocol: "http", spawnArgs: [] },
  { id: "warp", name: "Warp", binary: "warp", versionCmd: "warp --version", protocol: "http", spawnArgs: [] },
];

export const CLI_TOOLS = [
  { id: "claude-code", name: "Claude Code", file: "~/.claude/settings.json" },
  { id: "codex", name: "Codex CLI", file: "~/.codex/config.toml" },
  { id: "gemini", name: "Gemini CLI", file: "~/.gemini/settings.json" },
  { id: "openclaw", name: "OpenClaw", file: "~/.openclaw/config.json" },
  { id: "kilo", name: "Kilo Code", file: ".kilocode/config.json" },
  { id: "antigravity", name: "Antigravity", file: "~/.antigravity/config.json" },
  { id: "cline", name: "Cline", file: ".cline/config.json" },
  { id: "continue", name: "Continue", file: ".continue/config.json" },
  { id: "cursor", name: "Cursor", file: ".cursor/mcp.json" },
  { id: "factory", name: "Factory Droid", file: "~/.factory/config.json" },
];

export interface FreePool {
  id: string;
  name: string;
  models: number;
  forever: boolean;
  region: string;
  enabled: boolean;
}

export const FREE_POOLS: FreePool[] = [
  { id: "opencode-zen", name: "OpenCode Zen", models: 29, forever: true, region: "global", enabled: true },
  { id: "pollinations", name: "Pollinations", models: 12, forever: true, region: "global", enabled: true },
  { id: "nvidia-nim", name: "NVIDIA Build", models: 20, forever: false, region: "us", enabled: true },
  { id: "openrouter-free", name: "OpenRouter :free", models: 48, forever: false, region: "global", enabled: true },
  { id: "groq-free", name: "Groq Free", models: 8, forever: false, region: "us", enabled: false },
  { id: "gemini-free", name: "Gemini Free", models: 6, forever: false, region: "global", enabled: false },
  { id: "aihorde", name: "AI Horde", models: 22, forever: true, region: "p2p", enabled: false },
  { id: "huggingface", name: "HF Inference", models: 18, forever: false, region: "eu", enabled: false },
  { id: "together-free", name: "Together Free", models: 10, forever: false, region: "us", enabled: false },
  { id: "fireworks-free", name: "Fireworks Free", models: 7, forever: false, region: "us", enabled: false },
  { id: "deepseek-free", name: "DeepSeek trial", models: 2, forever: false, region: "cn", enabled: false },
  { id: "qwen-free", name: "Qwen Cloud", models: 9, forever: false, region: "cn", enabled: true },
  { id: "iflow", name: "iFlow", models: 5, forever: false, region: "cn", enabled: true },
  { id: "kiro", name: "Kiro", models: 3, forever: false, region: "global", enabled: true },
  { id: "arena", name: "Arena catalog", models: 40, forever: true, region: "local", enabled: true },
  { id: "duckgo", name: "DuckGo relay", models: 6, forever: true, region: "global", enabled: true },
  { id: "chutes", name: "Chutes", models: 14, forever: false, region: "global", enabled: false },
  { id: "hackclub", name: "Hack Club AI", models: 11, forever: true, region: "us", enabled: false },
  { id: "g4f-groq", name: "g4f Groq", models: 8, forever: true, region: "relay", enabled: false },
  { id: "g4f-gemini", name: "g4f Gemini", models: 5, forever: true, region: "relay", enabled: false },
  { id: "g4f-pollinations", name: "g4f Pollinations", models: 9, forever: true, region: "relay", enabled: false },
  { id: "g4f-ollama", name: "g4f Ollama", models: 4, forever: true, region: "local", enabled: false },
  { id: "g4f-nvidia", name: "g4f NVIDIA", models: 7, forever: false, region: "relay", enabled: false },
  { id: "naga", name: "Naga AC", models: 16, forever: false, region: "global", enabled: false },
  { id: "chatanywhere", name: "ChatAnywhere", models: 12, forever: false, region: "asia", enabled: false },
  { id: "electronhub", name: "ElectronHub", models: 10, forever: false, region: "global", enabled: false },
  { id: "llmgateway", name: "LLM Gateway", models: 15, forever: false, region: "global", enabled: false },
  { id: "poe-free", name: "Poe Free", models: 9, forever: false, region: "us", enabled: false },
  { id: "mistral-free", name: "Mistral Free", models: 4, forever: false, region: "eu", enabled: false },
  { id: "cohere-trial", name: "Cohere Trial", models: 3, forever: false, region: "us", enabled: false },
  { id: "cerebras-free", name: "Cerebras Free", models: 3, forever: false, region: "us", enabled: false },
  { id: "sambanova-free", name: "SambaNova Free", models: 4, forever: false, region: "us", enabled: false },
  { id: "cloudflare-ai", name: "Workers AI", models: 13, forever: false, region: "edge", enabled: false },
  { id: "github-models", name: "GitHub Models", models: 17, forever: false, region: "us", enabled: false },
  { id: "azure-free", name: "Azure AI Free", models: 8, forever: false, region: "us", enabled: false },
  { id: "vertex-free", name: "Vertex Free", models: 6, forever: false, region: "us", enabled: false },
  { id: "ollama-local", name: "Ollama local", models: 20, forever: true, region: "local", enabled: false },
  { id: "lmstudio", name: "LM Studio", models: 12, forever: true, region: "local", enabled: false },
  { id: "vllm", name: "vLLM", models: 8, forever: true, region: "local", enabled: false },
  { id: "llama-cpp", name: "llama.cpp", models: 10, forever: true, region: "local", enabled: false },
  { id: "jan", name: "Jan", models: 7, forever: true, region: "local", enabled: false },
  { id: "gpt4all", name: "GPT4All", models: 6, forever: true, region: "local", enabled: false },
  { id: "koboldcpp", name: "KoboldCpp", models: 5, forever: true, region: "local", enabled: false },
];

export const ACCENT_PRESETS = [
  { id: "blue", hex: "#3b82f6", label: "Frost Blue" },
  { id: "cyan", hex: "#06b6d4", label: "Ice Cyan" },
  { id: "indigo", hex: "#6366f1", label: "Indigo" },
  { id: "violet", hex: "#8b5cf6", label: "Violet" },
  { id: "emerald", hex: "#10b981", label: "Emerald" },
  { id: "amber", hex: "#f59e0b", label: "Amber" },
  { id: "rose", hex: "#f43f5e", label: "Rose" },
];

export const MCP_TOOLS = [
  "web_search", "web_fetch", "read_file", "write_file", "list_dir", "run_terminal",
  "git_status", "git_diff", "browser_open", "screenshot", "memory_get", "memory_put",
  "calendar", "email_draft", "sql_query", "http_request", "json_patch", "yaml_edit",
  "image_gen", "embed_text", "rerank", "compress_prompt", "route_model", "health_check",
  "quota_status",
];

export function maskEmail(email: string): string {
  const [u, d] = email.split("@");
  if (!u || !d) return email;
  const um = u[0] + "*****";
  const [h, ...rest] = d.split(".");
  return `${um}@${h[0]}*****.${rest.join(".")}`;
}

export function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}
