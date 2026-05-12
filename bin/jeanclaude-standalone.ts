#!/usr/bin/env node
/**
 * jeanclaude-standalone.ts — Native CLI wrapper (no Docker).
 *
 * Core responsibilities:
 *   - Model profile resolution (v4-flash, v4-flash-thinking, v4-pro, v4-pro-thinking)
 *   - DeepSeek-only auth (DEEPSEEK_API_KEY → Anthropic-compatible env vars)
 *   - Execution modes: direct (default), gateway (process/container/external), auto
 *   - Gateway lifecycle management (process mode)
 *   - State directories (XDG-style)
 *   - CLI flag interception (--model, --jeanclaude-mode, --gateway-mode, --gateway-url)
 *   - Subcommands: doctor, env, models, gateway, version
 *   - Dangerous mode (--yolo/-Y → --dangerously-skip-permissions)
 *   - Strict pass-through of unknown args to `claude`
 *   - Deprecated env alias warnings
 *   - Secret redaction, signal forwarding, exit-code preservation
 *
 * Compiled to bin/jeanclaude-standalone.js
 */

import { spawn, execFile, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync, unlinkSync, createReadStream, createWriteStream, watch } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotenv } from "../scripts/libdotenv.js";
import http from "node:http";
import https from "node:https";
import net from "node:net";

// ═══════════════════════════════════════════════════════════════════
// PATH HELPERS
// ═══════════════════════════════════════════════════════════════════
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

// ═══════════════════════════════════════════════════════════════════
// MODEL PROFILES
// ═══════════════════════════════════════════════════════════════════

interface ModelProfile {
  label: string;
  backendModel: string;
  thinkingEnabled: boolean;
  effort: string;
  description: string;
}

const MODEL_PROFILES: Record<string, ModelProfile> = {
  "v4-flash": {
    label: "v4-flash",
    backendModel: "deepseek-v4-flash",
    thinkingEnabled: false,
    effort: "low",
    description: "DeepSeek V4 Flash – fast, no thinking (default)",
  },
  "v4-flash-thinking": {
    label: "v4-flash-thinking",
    backendModel: "deepseek-v4-flash",
    thinkingEnabled: true,
    effort: "max",
    description: "DeepSeek V4 Flash – with thinking, max effort",
  },
  "v4-pro": {
    label: "v4-pro",
    backendModel: "deepseek-v4-pro",
    thinkingEnabled: false,
    effort: "low",
    description: "DeepSeek V4 Pro – largest, no thinking",
  },
  "v4-pro-thinking": {
    label: "v4-pro-thinking",
    backendModel: "deepseek-v4-pro",
    thinkingEnabled: true,
    effort: "max",
    description: "DeepSeek V4 Pro – with thinking, max effort",
  },
};

const VALID_PROFILES = Object.keys(MODEL_PROFILES);
const DEFAULT_PROFILE = "v4-flash";

/** Raw DeepSeek / legacy names that we explicitly reject. */
const REJECTED_MODEL_NAMES = new Set([
  "deepseek-chat",
  "deepseek-reasoner",
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "claude-sonnet-4-20250514",
  "claude-3-5-sonnet-20241022",
  "claude-3-opus-20240229",
  "claude-3-5-haiku-20241022",
  "gpt-4o",
  "gpt-4-turbo",
  "o1",
  "o3",
]);

function resolveModelProfile(profile: string): ModelProfile {
  // Check for valid profile name first
  if (MODEL_PROFILES[profile]) {
    return MODEL_PROFILES[profile];
  }
  // Reject raw DeepSeek names, Anthropic names, OpenAI names, legacy aliases
  if (REJECTED_MODEL_NAMES.has(profile) || /^(claude-|gpt-|o[0-9])/.test(profile)) {
    process.stderr.write(
      `jeanclaude: Unknown model: ${profile}. JeanClaude supports: ${VALID_PROFILES.join(", ")}\n`
    );
    process.exit(1);
  }
  // Also reject any unrecognized model
  process.stderr.write(
    `jeanclaude: Unknown model: ${profile}. JeanClaude supports: ${VALID_PROFILES.join(", ")}\n`
  );
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════
// VERSION
// ═══════════════════════════════════════════════════════════════════
function getVersion(): string {
  // Read JeanClaude package version. Never read runtime state.
  try {
    const raw = readFileSync(resolve(REPO_ROOT, "package.json"), "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.version) return parsed.version;
  } catch { /* fall through */ }
  return "0.2.1";
}

// ═══════════════════════════════════════════════════════════════════
// DOTENV
// ═══════════════════════════════════════════════════════════════════
function maybeLoadDotenv(): void {
  if (process.env.JEANCLAUDE_NO_DOTENV !== "1") {
    const envFile = resolve(REPO_ROOT, ".env");
    if (existsSync(envFile)) {
      loadDotenv(envFile);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// STATE DIRECTORIES (XDG-style)
// ═══════════════════════════════════════════════════════════════════
function getJeanclaudeConfigDir(): string {
  return process.env.JEANCLAUDE_CONFIG_HOME ??
    resolve(process.env.XDG_CONFIG_HOME ?? resolve(process.env.HOME ?? "/tmp", ".config"), "jeanclaude");
}
function getJeanclaudeStateDir(): string {
  return process.env.JEANCLAUDE_STATE_HOME ??
    resolve(process.env.XDG_STATE_HOME ?? resolve(process.env.HOME ?? "/tmp", ".local", "state"), "jeanclaude");
}
function getJeanclaudeCacheDir(): string {
  return process.env.JEANCLAUDE_CACHE_HOME ??
    resolve(process.env.XDG_CACHE_HOME ?? resolve(process.env.HOME ?? "/tmp", ".cache"), "jeanclaude");
}

function ensureStateDirs(): void {
  const dirs = [
    resolve(getJeanclaudeStateDir(), "run"),
    resolve(getJeanclaudeStateDir(), "log"),
    getJeanclaudeCacheDir(),
    getJeanclaudeConfigDir(),
  ];
  for (const d of dirs) {
    try { mkdirSync(d, { recursive: true, mode: 0o700 }); } catch { /* best-effort */ }
  }
}

// ═══════════════════════════════════════════════════════════════════
// SECRET REDACTION
// ═══════════════════════════════════════════════════════════════════
const SECRET_KEYS = new Set([
  "DEEPSEEK_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_API_KEY",
  "JEANCLAUDE_OPEN_RESPONSES_API_KEY",
  "RESPONSE_API_KEY",
  "RESPONSES_API_KEY",
  "BRAVE_API_KEY",
  "UNSTRUCTURED_API_KEY",
  "OPENAI_API_KEY",
  "MEMORY_STORE_PASSWORD",
  "CODESEEQ_BRIDGE_API_KEY",
]);

function looksLikeSecret(val: string): boolean {
  if (val.length < 8) return false;
  return (
    /^sk-/.test(val) ||
    /^sk-ant-/.test(val) ||
    /^sk-proj-/.test(val) ||
    /^[A-Za-z0-9+/=]{20,}$/.test(val)
  );
}

function redact(val: string): string {
  if (val.length <= 8) return "***";
  return val.slice(0, 4) + "..." + val.slice(-4);
}

function redactEnvValue(key: string, val: string): string {
  if (SECRET_KEYS.has(key) || looksLikeSecret(val)) return redact(val);
  return val;
}

// ═══════════════════════════════════════════════════════════════════
// AUTH: PARENT ANTHROPIC AUTH STRIPPING
// ═══════════════════════════════════════════════════════════════════
const ANTHROPIC_AUTH_VARS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"];
const CLAUDE_SESSION_VARS = [
  "CLAUDE_ACCESS_TOKEN", "CLAUDE_REFRESH_TOKEN",
  "CLAUDE_ORG_ID", "CLAUDE_SESSION_ID",
];

function stripParentAnthropicAuth(): void {
  for (const v of ANTHROPIC_AUTH_VARS) delete process.env[v];
  for (const v of CLAUDE_SESSION_VARS) delete process.env[v];
}

// ═══════════════════════════════════════════════════════════════════
// DEPRECATED ENV ALIASES
// ═══════════════════════════════════════════════════════════════════
const DEPRECATED_ENV_MAP: Record<string, { newKey: string; deprecationMsg: string }> = {
  JEANCLAUDE_MODEL: {
    newKey: "JEANCLAUDE_MODEL_PROFILE",
    deprecationMsg: "JEANCLAUDE_MODEL is deprecated. Use JEANCLAUDE_MODEL_PROFILE instead.",
  },
  JEANCLAUDE_BRIDGE_MODE: {
    newKey: "JEANCLAUDE_GATEWAY_MODE",
    deprecationMsg: "JEANCLAUDE_BRIDGE_MODE is deprecated. Use JEANCLAUDE_GATEWAY_MODE instead.",
  },
  RESPONSE_API_KEY: {
    newKey: "JEANCLAUDE_OPEN_RESPONSES_API_KEY",
    deprecationMsg: "RESPONSE_API_KEY is deprecated. Use JEANCLAUDE_OPEN_RESPONSES_API_KEY instead.",
  },
  RESPONSES_API_KEY: {
    newKey: "JEANCLAUDE_OPEN_RESPONSES_API_KEY",
    deprecationMsg: "RESPONSES_API_KEY is deprecated. Use JEANCLAUDE_OPEN_RESPONSES_API_KEY instead.",
  },
};

const _warnedDeprecations = new Set<string>();
function warnOnce(msg: string): void {
  if (_warnedDeprecations.has(msg)) return;
  _warnedDeprecations.add(msg);
  process.stderr.write("jeanclaude: " + msg + "\n");
}

function applyDeprecatedEnvAliases(): void {
  for (const [oldKey, { newKey, deprecationMsg }] of Object.entries(DEPRECATED_ENV_MAP)) {
    if (process.env[oldKey] !== undefined && process.env[oldKey] !== "") {
      warnOnce(deprecationMsg);
      if (process.env[newKey] === undefined || process.env[newKey] === "") {
        process.env[newKey] = process.env[oldKey];
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXECUTION MODES
// ═══════════════════════════════════════════════════════════════════
type JeanclaudeMode = "direct" | "gateway" | "auto";
type GatewayMode = "process" | "container" | "external" | "auto";

function resolveJeanclaudeMode(cliMode?: string): JeanclaudeMode {
  const envMode = (process.env.JEANCLAUDE_MODE ?? "").toLowerCase();
  const mode = (cliMode ?? envMode) || "auto";
  if (mode === "direct" || mode === "gateway" || mode === "auto") {
    return mode as JeanclaudeMode;
  }
  if (mode === "bridge") {
    warnOnce("JEANCLAUDE_MODE=bridge is deprecated. Use 'gateway' instead.");
    return "gateway";
  }
  process.stderr.write("jeanclaude: Unknown JEANCLAUDE_MODE '" + mode + "'. Must be direct, gateway, or auto.\n");
  process.exit(1);
}

function resolveGatewayMode(cliMode?: string): GatewayMode {
  const envMode = (process.env.JEANCLAUDE_GATEWAY_MODE ?? "").toLowerCase();
  const mode = (cliMode ?? envMode) || "auto";
  if (mode === "process" || mode === "container" || mode === "external" || mode === "auto") {
    return mode as GatewayMode;
  }
  process.stderr.write("jeanclaude: Unknown JEANCLAUDE_GATEWAY_MODE '" + mode + "'. Must be process, container, external, or auto.\n");
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════
// CLAUDE BINARY DISCOVERY
// ═══════════════════════════════════════════════════════════════════
function findClaudeBin(): string | null {
  if (process.env.JEANCLAUDE_CLAUDE_BIN) {
    return process.env.JEANCLAUDE_CLAUDE_BIN;
  }

  const pathDirs = (process.env.PATH ?? "").split(":");
  const selfPath = process.argv[1] ? resolve(process.argv[1]) : null;
  const jeanclaudeWrapper = resolve(REPO_ROOT, "bin", "jeanclaude");
  const jeanclaudeStandalone = resolve(REPO_ROOT, "bin", "jeanclaude-standalone");

  for (const dir of pathDirs) {
    const candidate = resolve(dir, "claude");
    if (!existsSync(candidate)) continue;

    let real: string;
    try { real = realpathSync(candidate); } catch { real = candidate; }

    if (real === jeanclaudeWrapper || real === jeanclaudeStandalone || real === selfPath) continue;
    if (real === resolve(REPO_ROOT, "bin", "jeanclaude-standalone")) continue;
    if (real === resolve(REPO_ROOT, "bin", "jeanclaude")) continue;

    return candidate;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// GATEWAY LIFECYCLE
// ═══════════════════════════════════════════════════════════════════

function findGatewayServer(): string {
  const candidates = [
    resolve(REPO_ROOT, "gateway", "dist", "src", "server.js"),
    resolve(REPO_ROOT, "gateway", "src", "server.ts"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  process.stderr.write("jeanclaude: gateway server not found. Build the gateway package first.\n");
  process.exit(1);
}

function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Could not determine port")));
      }
    });
    server.on("error", reject);
  });
}

function healthCheckGateway(url: string, timeoutMs = 10000): Promise<boolean> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); resolve(false); }, timeoutMs);

    const normalizedUrl = url.replace(/\/+$/, "");
    // Need to handle both http and https for flexibility
    const mod = normalizedUrl.startsWith("https") ? https : http;
    mod.get(normalizedUrl + "/healthz", { signal: controller.signal }, (res) => {
      clearTimeout(timer);
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.ok === true);
        } catch {
          resolve(res.statusCode === 200);
        }
      });
    }).on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

interface GatewayProcess {
  token: string;
  child: ChildProcess;
  port: number;
  host: string;
  url: string;
}

async function startGatewayProcess(): Promise<GatewayProcess> {
  const gatewayServer = findGatewayServer();
  const port = await pickFreePort();
  const host = "127.0.0.1";
  const url = "http://" + host + ":" + port;
  const token = "jeanclaude-gateway-" + Math.random().toString(36).slice(2, 10);

  const gatewayEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) gatewayEnv[k] = v;
  }
  gatewayEnv.JEANCLAUDE_GATEWAY_HOST = host;
  gatewayEnv.JEANCLAUDE_GATEWAY_PORT = String(port);
  gatewayEnv.JEANCLAUDE_GATEWAY_TOKEN = token;
  for (const v of ANTHROPIC_AUTH_VARS) delete gatewayEnv[v];

  if (!gatewayEnv.DEEPSEEK_API_KEY) {
    process.stderr.write("jeanclaude: DEEPSEEK_API_KEY is required to start the gateway.\n");
    process.exit(1);
  }

  const logDir = resolve(getJeanclaudeStateDir(), "log");
  let logStream: import("node:fs").WriteStream | null = null;
  try { mkdirSync(logDir, { recursive: true }); logStream = createWriteStream(resolve(logDir, "gateway.log"), { flags: "a" }); } catch { /* best effort */ }

  return new Promise((resolveGateway, rejectGateway) => {
    const child = spawn("node", [gatewayServer], {
      stdio: ["pipe", "pipe", "pipe"],
      env: gatewayEnv,
    });

    let started = false;
    const startupTimeoutMs = Number(process.env.JEANCLAUDE_GATEWAY_START_TIMEOUT ?? "15000");

    const startupTimeout = setTimeout(() => {
      if (!started) {
        child.kill("SIGKILL");
        let logTail = "";
        try {
          const logFile = resolve(logDir, "gateway.log");
          if (existsSync(logFile)) {
            const lines = readFileSync(logFile, "utf-8").split(/\r?\n/);
            logTail = lines.slice(-10).join("\n");
          }
        } catch { /* best effort */ }
        rejectGateway(new Error("Gateway failed to start within " + (startupTimeoutMs / 1000) + "s. Last log lines:\n" + logTail));
      }
    }, startupTimeoutMs);

    // Log output to file
    function onOutput(data: Buffer): void {
      if (logStream) logStream.write(data);
    }
    child.stdout?.on("data", onOutput);
    child.stderr?.on("data", onOutput);

    // Poll healthz endpoint
    const pollInterval = 100;
    const maxAttempts = Math.ceil(startupTimeoutMs / pollInterval);
    let attempts = 0;

    const pollTimer = setInterval(async () => {
      attempts++;
      try {
        const ok = await healthCheckGateway(url, 2000);
        if (ok) {
          started = true;
          clearTimeout(startupTimeout);
          clearInterval(pollTimer);
          const pidDir = resolve(getJeanclaudeStateDir(), "run");
          try { mkdirSync(pidDir, { recursive: true }); writeFileSync(resolve(pidDir, "gateway.pid"), String(child.pid ?? ""), "utf-8"); } catch { /* best effort */ }
          resolveGateway({ child, port, host, url, token });
        }
      } catch { /* health check threw, will retry */ }
      if (attempts >= maxAttempts && !started) {
        clearInterval(pollTimer);
        // Let timeout handle it
      }
    }, pollInterval);

    child.on("error", (err) => { clearTimeout(startupTimeout); clearInterval(pollTimer); rejectGateway(err); });
    child.on("exit", (code) => {
      if (!started) {
        clearTimeout(startupTimeout);
        clearInterval(pollTimer);
        rejectGateway(new Error("Gateway exited prematurely with code " + code));
      }
    });
  });
}

async function stopGatewayByPid(): Promise<boolean> {
  const pidFile = resolve(getJeanclaudeStateDir(), "run", "gateway.pid");
  try {
    const pidStr = readFileSync(pidFile, "utf-8").trim();
    const pid = Number(pidStr);
    if (pid > 0) {
      try {
        process.kill(pid, "SIGTERM");
        unlinkSync(pidFile);
        return true;
      } catch (e: any) {
        if (e.code === "ESRCH") { try { unlinkSync(pidFile); } catch { /* ok */ } return true; }
        return false;
      }
    }
  } catch { return false; }
  return false;
}

function tailGatewayLogs(): void {
  const logFile = resolve(getJeanclaudeStateDir(), "log", "gateway.log");
  if (!existsSync(logFile)) {
    process.stderr.write("jeanclaude: gateway log file not found at " + logFile + "\n");
    process.exit(1);
  }
  const stream = createReadStream(logFile, { encoding: "utf-8" });
  stream.pipe(process.stdout);
  stream.on("end", () => process.exit(0));
  stream.on("error", (err: Error) => {
    process.stderr.write("jeanclaude: error reading gateway logs: " + err.message + "\n");
    process.exit(1);
  });
  try { const watcher = watch(logFile, () => {}); process.on("SIGINT", () => { watcher.close(); process.exit(0); }); process.on("SIGTERM", () => { watcher.close(); process.exit(0); }); } catch { /* fs.watch unavailable */ }
}

// ═══════════════════════════════════════════════════════════════════
// ENV MAPPING
// ═══════════════════════════════════════════════════════════════════

function isClaudeBinExplicitlySet(): boolean {
  return (process.env.JEANCLAUDE_CLAUDE_BIN ?? "").length > 0;
}

function setupClaudeEnv(modelProfile: ModelProfile, gatewayUrl?: string, gatewayToken?: string): void {
  const deepseekKey = process.env.DEEPSEEK_API_KEY ?? "";

  // Only enforce DEEPSEEK_API_KEY when we auto-discovered claude
  if (!deepseekKey) {
    process.stderr.write(
      "jeanclaude: DEEPSEEK_API_KEY is required. JeanClaude does not use Anthropic/Claude authentication.\n"
    );
    process.exit(1);
  }

  const mode = resolveJeanclaudeMode(
    process.env._JEANCLAUDE_CLI_MODE
  );
  const isGatewayEffective = mode === "gateway" || (mode === "auto" && !!gatewayUrl);

  if (isGatewayEffective && gatewayUrl) {
    process.env.ANTHROPIC_BASE_URL = gatewayUrl.replace(/\/+$/, "");
    process.env.ANTHROPIC_AUTH_TOKEN = gatewayToken ?? "jeanclaude-gateway";
    process.env.ANTHROPIC_API_KEY = gatewayToken ?? "jeanclaude-gateway";
    delete process.env.DEEPSEEK_API_KEY;
  } else {
    process.env.ANTHROPIC_BASE_URL =
      process.env.JEANCLAUDE_ANTHROPIC_BASE_URL ?? "https://api.deepseek.com/anthropic";
    process.env.ANTHROPIC_AUTH_TOKEN = deepseekKey;
    process.env.ANTHROPIC_API_KEY = deepseekKey;
  }

  process.env.ANTHROPIC_MODEL = modelProfile.backendModel;
  process.env.ANTHROPIC_DEFAULT_OPUS_MODEL = modelProfile.backendModel;
  process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = modelProfile.backendModel;
  process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = "deepseek-v4-flash";
  process.env.CLAUDE_CODE_SUBAGENT_MODEL = "deepseek-v4-flash";

  delete process.env.CLAUDE_CODE_DISABLE_THINKING;
  delete process.env.CLAUDE_CODE_EFFORT_LEVEL;

  if (modelProfile.thinkingEnabled) {
    process.env.CLAUDE_CODE_EFFORT_LEVEL = modelProfile.effort;
  } else {
    process.env.CLAUDE_CODE_DISABLE_THINKING = "1";
  }
}

// ═══════════════════════════════════════════════════════════════════
// ARGV HELPERS
// ═══════════════════════════════════════════════════════════════════

function hasFlag(argv: string[], flag: string): boolean {
  return argv.some((a) => a === flag || a.startsWith(flag + "="));
}

function getFlagValue(argv: string[], flag: string): string | null {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag) {
      if (i + 1 < argv.length) return argv[i + 1];
      return null;
    }
    if (argv[i].startsWith(flag + "=")) {
      return argv[i].split("=", 2)[1];
    }
  }
  return null;
}

function getPermissionMode(argv: string[]): string | null {
  return getFlagValue(argv, "--permission-mode");
}

// ═══════════════════════════════════════════════════════════════════
// SUBCOMMANDS
// ═══════════════════════════════════════════════════════════════════

function cmdVersion(): never {
  console.log(getVersion());
  process.exit(0);
}

function cmdEnv(): void {
  const keys = Object.keys(process.env).sort();
  for (const k of keys) {
    const val = process.env[k] ?? "";
    console.log(k + "=" + redactEnvValue(k, val));
  }
  process.exit(0);
}

function cmdModels(args: string[]): void {
  const jsonFlag = args.includes("--json");
  if (jsonFlag) {
    const profiles: Record<string, Omit<ModelProfile, "label">> = {};
    for (const [name, p] of Object.entries(MODEL_PROFILES)) {
      profiles[name] = {
        backendModel: p.backendModel,
        thinkingEnabled: p.thinkingEnabled,
        effort: p.effort,
        description: p.description,
      };
    }
    console.log(JSON.stringify({ profiles, default: DEFAULT_PROFILE }, null, 2));
  } else {
    console.log("JeanClaude Model Profiles");
    console.log("========================");
    for (const [name, p] of Object.entries(MODEL_PROFILES)) {
      const defaultBadge = name === DEFAULT_PROFILE ? " [default]" : "";
      const thinkingBadge = p.thinkingEnabled ? " (thinking, effort: max)" : "";
      console.log("  " + name + defaultBadge + thinkingBadge);
      console.log("    Backend: " + p.backendModel);
      console.log("    " + p.description);
      console.log();
    }
  }
  process.exit(0);
}

async function cmdDoctor(): Promise<void> {
  let ok = true;
  const problems: string[] = [];
  const checks: string[] = [];

  // 1. Claude binary
  const claudeBin = findClaudeBin();
  if (!claudeBin) {
    ok = false;
    problems.push("claude binary not found on PATH and JEANCLAUDE_CLAUDE_BIN not set");
    checks.push("claude binary: MISSING");
  } else {
    checks.push("claude binary: " + claudeBin);
  }

  // 2. -Y collision check
  if (claudeBin) {
    try {
      const helpOut = await execCapture(claudeBin, ["--help"]);
      if (helpOut.includes("  -Y") || helpOut.includes("\t-Y") || /[^a-zA-Z]-Y[, \t]/.test(helpOut)) {
        ok = false;
        problems.push("COLLISION: claude --help shows -Y as a recognized flag. JeanClaude -Y dangerous mode may conflict.");
        checks.push("-Y collision check: COLLISION DETECTED");
      } else {
        checks.push("-Y collision check: safe (claude does not use -Y)");
      }
    } catch {
      checks.push("-Y collision check: skipped (could not run claude --help)");
    }
  }

  // 3. DeepSeek key
  const dsk = process.env.DEEPSEEK_API_KEY ?? "";
  if (!dsk) {
    ok = false;
    problems.push("DEEPSEEK_API_KEY not set");
    checks.push("DeepSeek API key: MISSING");
  } else {
    checks.push("DeepSeek API key: " + redact(dsk));
  }

  // 4. Model profile validation
  const rawProfile = process.env.JEANCLAUDE_MODEL_PROFILE ?? DEFAULT_PROFILE;
  let profileValid = true;
  try { resolveModelProfile(rawProfile); } catch { profileValid = false; }
  if (!profileValid) {
    ok = false;
    problems.push("Invalid model profile: " + rawProfile + ". Valid: " + VALID_PROFILES.join(", "));
  }
  checks.push("Model profile: " + rawProfile + (profileValid ? " (valid)" : " (INVALID)"));

  // 5. Execution mode
  const mode = resolveJeanclaudeMode();
  checks.push("JeanClaude mode: " + mode);

  // 6. Base URL
  const baseUrl = process.env.ANTHROPIC_BASE_URL ?? process.env.JEANCLAUDE_ANTHROPIC_BASE_URL ?? "https://api.deepseek.com/anthropic";
  checks.push("ANTHROPIC_BASE_URL: " + baseUrl);

  // 7. Parent Anthropic auth detection
  const hasParentAuth = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  if (hasParentAuth) {
    checks.push("Parent Anthropic auth: DETECTED (will be stripped from child)");
  } else {
    checks.push("Parent Anthropic auth: clean (none detected)");
  }

  // 8. Gateway mode checks
  if (mode === "gateway") {
    const gwMode = resolveGatewayMode();
    checks.push("Gateway mode: " + gwMode);
    if (gwMode === "process") {
      try { findGatewayServer(); checks.push("Gateway server: found"); } catch { ok = false; problems.push("Gateway server not found. Build the gateway package."); checks.push("Gateway server: MISSING"); }
    }
    if (gwMode === "external") {
      const gwUrl = process.env.JEANCLAUDE_GATEWAY_URL ?? "";
      if (!gwUrl) {
        ok = false; problems.push("JEANCLAUDE_GATEWAY_URL not set for external gateway mode");
        checks.push("Gateway URL: MISSING");
      } else {
        checks.push("Gateway URL: " + gwUrl);
        const healthy = await healthCheckGateway(gwUrl);
        if (!healthy) { ok = false; problems.push("Gateway health check failed: " + gwUrl); checks.push("Gateway health: UNREACHABLE"); }
        else checks.push("Gateway health: OK");
      }
    }
  }

  // 9. State directory permissions
  try {
    const stateDir = getJeanclaudeStateDir();
    const testFile = resolve(stateDir, "run", ".doctor-test");
    writeFileSync(testFile, "ok"); unlinkSync(testFile);
    checks.push("State dir permissions: OK");
  } catch {
    try {
      const runDir = resolve(getJeanclaudeStateDir(), "run");
      mkdirSync(runDir, { recursive: true }); unlinkSync(runDir);
      checks.push("State dir permissions: OK (created)");
    } catch {
      ok = false; problems.push("Cannot create state directory: " + getJeanclaudeStateDir());
      checks.push("State dir permissions: FAILED");
    }
  }

  // 10. Parent Claude session vars
  for (const v of [...ANTHROPIC_AUTH_VARS, ...CLAUDE_SESSION_VARS]) {
    if (process.env[v]) checks.push("Parent env " + v + ": WILL BE STRIPPED");
  }

  // 11. Banned paths in repo
  const BANNED_PATHS = [".codeseeq", ".env", ".DS_Store", "claude-code", "open-responses"];
  const foundBanned: string[] = [];
  for (const p of BANNED_PATHS) {
    const full = resolve(REPO_ROOT, p);
    if (existsSync(full)) foundBanned.push(p);
  }
  if (foundBanned.length > 0) {
    ok = false;
    problems.push("Banned paths found in repo: " + foundBanned.join(", "));
    checks.push("Banned paths: FOUND " + foundBanned.join(", "));
  } else {
    checks.push("Banned paths: clean");
  }

  // 12. Direct mode base URL check
  if (mode === "direct") {
    const currentBase = process.env.ANTHROPIC_BASE_URL ?? "";
    const expectedBase = "https://api.deepseek.com/anthropic";
    if (currentBase && currentBase !== expectedBase) {
      ok = false;
      problems.push("Direct mode ANTHROPIC_BASE_URL is " + currentBase + " but should be " + expectedBase);
      checks.push("Direct mode base URL: MISMATCH (got " + currentBase + ")");
    } else {
      checks.push("Direct mode base URL: OK (" + expectedBase + ")");
    }
  }

  // 13. Config templates don't expose raw backend models
  try {
    const configDir = resolve(REPO_ROOT, "config");
    if (existsSync(configDir)) {
      const configFiles = readdirSync(configDir);
      let configClean = true;
      for (const f of configFiles) {
        const fp = resolve(configDir, f);
        try {
          const s = statSync(fp);
          if (s.isFile()) {
            const contents = readFileSync(fp, "utf-8");
            for (const rawModel of ["deepseek-v4-flash", "deepseek-v4-pro"]) {
              if (contents.includes(rawModel)) {
                ok = false;
                problems.push("Config file " + f + " exposes raw backend model: " + rawModel);
                configClean = false;
              }
            }
          }
        } catch { /* skip unreadable files */ }
      }
      checks.push("Config templates: " + (configClean ? "clean" : "EXPOSE RAW MODELS"));
    } else {
      checks.push("Config templates: no config directory");
    }
  } catch {
    checks.push("Config templates: could not scan");
  }

  // 14. Gateway token status (redacted)
  const gwToken = process.env.ANTHROPIC_AUTH_TOKEN ?? "";
  if (gwToken && gwToken !== "jeanclaude-gateway") {
    const tokenLen = gwToken.length;
    checks.push("Gateway token: present (length " + tokenLen + ")");
  } else if (gwToken === "jeanclaude-gateway") {
    checks.push("Gateway token: default placeholder");
  } else {
    checks.push("Gateway token: not set");
  }

  // 15. Package integrity — can create without banned paths
  try {
    // Use the standalone TS import to check libdotenv
    const libdotenv = resolve(REPO_ROOT, "scripts", "libdotenv.js");
    if (existsSync(libdotenv)) {
      checks.push("Package integrity: libdotenv present");
    } else {
      checks.push("Package integrity: libdotenv MISSING");
    }
    // Check standalone.js exists
    const standaloneJs = resolve(REPO_ROOT, "bin", "jeanclaude-standalone.js");
    if (existsSync(standaloneJs)) {
      checks.push("Package integrity: standalone.js present");
    } else {
      ok = false;
      problems.push("bin/jeanclaude-standalone.js not found. Compile with esbuild.");
      checks.push("Package integrity: standalone.js MISSING");
    }
  } catch {
    checks.push("Package integrity: could not verify");
  }

  console.log("JeanClaude Doctor Report");
  console.log("========================");
  for (const c of checks) console.log("  " + c);
  if (problems.length > 0) { console.log("\nProblems:"); for (const p of problems) console.log("  ✗ " + p); }
  if (ok) console.log("\n✓ All checks passed.");
  process.exit(ok ? 0 : 1);
}

function execCapture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 5000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

async function cmdGateway(subArgs: string[]): Promise<void> {
  const action = subArgs[0];
  switch (action) {
    case "serve": {
      process.stderr.write("[jeanclaude] Starting gateway...\n");
      try {
        const gw = await startGatewayProcess();
        process.stderr.write("[jeanclaude] Gateway listening on " + gw.url + " (PID " + gw.child.pid + ")\n");
        process.on("SIGINT", () => { gw.child.kill("SIGINT"); process.exit(0); });
        process.on("SIGTERM", () => { gw.child.kill("SIGTERM"); process.exit(0); });
        gw.child.on("exit", (code) => { process.exit(code ?? 0); });
        gw.child.stdout?.pipe(process.stdout);
        gw.child.stderr?.pipe(process.stderr);
      } catch (err: any) {
        process.stderr.write("[jeanclaude] Gateway failed to start: " + err.message + "\n");
        process.exit(1);
      }
      return;
    }
    case "health": {
      const gwUrl = process.env.JEANCLAUDE_GATEWAY_URL ?? "http://127.0.0.1:8765";
      const healthy = await healthCheckGateway(gwUrl);
      if (healthy) { console.log("Gateway is healthy at " + gwUrl); process.exit(0); }
      else { console.log("Gateway is unreachable at " + gwUrl); process.exit(1); }
      return;
    }
    case "stop": {
      const stopped = await stopGatewayByPid();
      if (stopped) { console.log("Gateway stopped."); process.exit(0); }
      else { console.log("No running gateway found (no PID file)."); process.exit(1); }
      return;
    }
    case "logs": {
      tailGatewayLogs();
      return;
    }
    default: {
      process.stderr.write("jeanclaude: gateway subcommand required: serve, health, stop, or logs\n");
      process.exit(1);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ARGV PROCESSING
// ═══════════════════════════════════════════════════════════════════

function isProjectPurge(argv: string[]): boolean {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "project" && argv[i + 1] === "purge") return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════
// SIGNAL FORWARDING
// ═══════════════════════════════════════════════════════════════════

function forwardSignals(child: ChildProcess): void {
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
  for (const sig of signals) {
    process.on(sig, () => {
      if (child.pid && !child.killed) {
        child.kill(sig);
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// RUN CLAUDE
// ═══════════════════════════════════════════════════════════════════

interface RunClaudeOptions {
  claudeBin: string;
  argv: string[];
  modelProfile: ModelProfile;
  gatewayUrl?: string;
  gatewayProcess?: GatewayProcess;
}

function runClaude(opts: RunClaudeOptions): void {
  const { claudeBin, argv, modelProfile, gatewayUrl, gatewayProcess } = opts;

  // Build child env
  const childEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) childEnv[k] = v;
  }

  // Strip parent Anthropic auth from child env
  for (const v of ANTHROPIC_AUTH_VARS) delete childEnv[v];
  for (const v of CLAUDE_SESSION_VARS) delete childEnv[v];

  // Set up JeanClaude auth + model env
  setupClaudeEnv(modelProfile, gatewayUrl, gatewayProcess?.token);

  // Merge critical env vars into childEnv
  const CRITICAL_ENV = [
    "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY",
    "ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL", "CLAUDE_CODE_SUBAGENT_MODEL",
    "CLAUDE_CODE_EFFORT_LEVEL", "CLAUDE_CODE_DISABLE_THINKING",
    "DEEPSEEK_API_KEY", "JEANCLAUDE_MODEL_PROFILE",
  ];
  for (const k of CRITICAL_ENV) {
    const val = process.env[k];
    if (val !== undefined && val !== null) childEnv[k] = val;
  }

  const child = spawn(claudeBin, argv, {
    stdio: "inherit",
    env: childEnv,
  });

  forwardSignals(child);

  const cleanup = () => {
    if (gatewayProcess && gatewayProcess.child && !gatewayProcess.child.killed) {
      if (process.env.JEANCLAUDE_GATEWAY_KEEPALIVE !== "1") {
        gatewayProcess.child.kill("SIGTERM");
        const pidFile = resolve(getJeanclaudeStateDir(), "run", "gateway.pid");
        try { unlinkSync(pidFile); } catch { /* best effort */ }
      }
    }
  };

  child.on("exit", (code, signal) => {
    cleanup();
    if (signal) {
      const sigMap: Record<string, number> = { SIGINT: 2, SIGTERM: 15, SIGHUP: 1 };
      process.exit(128 + (sigMap[signal] ?? 1));
    }
    process.exit(code ?? 1);
  });

  child.on("error", (err) => {
    cleanup();
    process.stderr.write("jeanclaude: failed to spawn claude: " + err.message + "\n");
    process.exit(1);
  });
}

// ═══════════════════════════════════════════════════════════════════
// ENTRYPOINT
// ═══════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  maybeLoadDotenv();
  applyDeprecatedEnvAliases();
  ensureStateDirs();

  const rawArgs = process.argv.slice(2);

  // --version (before any subcommand parsing)
  if (rawArgs.includes("--version")) {
    const firstNonFlag = rawArgs.find((a) => !a.startsWith("-"));
    if (!firstNonFlag || firstNonFlag === "--version") {
      cmdVersion();
    }
  }

  // Subcommand: models
  if (rawArgs[0] === "models") {
    cmdModels(rawArgs.slice(1));
    return;
  }

  // Subcommand: doctor
  if (rawArgs[0] === "doctor") {
    await cmdDoctor();
    return;
  }

  // Subcommand: env
  if (rawArgs[0] === "env") {
    cmdEnv();
    return;
  }

  // Subcommand: gateway
  if (rawArgs[0] === "gateway") {
    await cmdGateway(rawArgs.slice(1));
    return;
  }

  // ── Process argv for JeanClaude-specific flags ──────────────────
  let passArgs = [...rawArgs];

  // --model: intercept and resolve to model profile
  let cliModelProfile: string | null = null;
  for (let i = passArgs.length - 1; i >= 0; i--) {
    if (passArgs[i] === "--model") {
      if (i + 1 < passArgs.length && !passArgs[i + 1].startsWith("-")) {
        cliModelProfile = passArgs[i + 1];
        passArgs.splice(i, 2);
      }
    } else if (passArgs[i].startsWith("--model=")) {
      cliModelProfile = passArgs[i].split("=", 2)[1];
      passArgs.splice(i, 1);
    }
  }

  // --jeanclaude-mode
  let cliJeanclaudeMode: string | null = null;
  for (let i = passArgs.length - 1; i >= 0; i--) {
    if (passArgs[i] === "--jeanclaude-mode" && i + 1 < passArgs.length) {
      cliJeanclaudeMode = passArgs[i + 1];
      passArgs.splice(i, 2);
    } else if (passArgs[i].startsWith("--jeanclaude-mode=")) {
      cliJeanclaudeMode = passArgs[i].split("=", 2)[1];
      passArgs.splice(i, 1);
    }
  }

  // --gateway-mode
  let cliGatewayMode: string | null = null;
  for (let i = passArgs.length - 1; i >= 0; i--) {
    if (passArgs[i] === "--gateway-mode" && i + 1 < passArgs.length) {
      cliGatewayMode = passArgs[i + 1];
      passArgs.splice(i, 2);
    } else if (passArgs[i].startsWith("--gateway-mode=")) {
      cliGatewayMode = passArgs[i].split("=", 2)[1];
      passArgs.splice(i, 1);
    }
  }

  // --gateway-url
  let cliGatewayUrl: string | null = null;
  for (let i = passArgs.length - 1; i >= 0; i--) {
    if (passArgs[i] === "--gateway-url" && i + 1 < passArgs.length) {
      cliGatewayUrl = passArgs[i + 1];
      passArgs.splice(i, 2);
    } else if (passArgs[i].startsWith("--gateway-url=")) {
      cliGatewayUrl = passArgs[i].split("=", 2)[1];
      passArgs.splice(i, 1);
    }
  }

  // ── Resolve model profile ───────────────────────────────────────
  const resolvedProfileName = cliModelProfile ??
    (process.env.JEANCLAUDE_MODEL_PROFILE && process.env.JEANCLAUDE_MODEL_PROFILE !== "" ? process.env.JEANCLAUDE_MODEL_PROFILE : undefined) ??
    DEFAULT_PROFILE;
  const modelProfile = resolveModelProfile(resolvedProfileName);
  process.env.JEANCLAUDE_MODEL_PROFILE = resolvedProfileName;

  if (cliModelProfile && process.env.JEANCLAUDE_QUIET !== "1") {
    process.stderr.write(
      "jeanclaude: using model profile '" + resolvedProfileName + "' -> backend '" + modelProfile.backendModel + "'\n"
    );
  }

  // ── Resolve execution mode ──────────────────────────────────────
  const jeanclaudeMode = resolveJeanclaudeMode(cliJeanclaudeMode ?? undefined);
  process.env._JEANCLAUDE_CLI_MODE = jeanclaudeMode;

  // ── Process --yolo / -Y ─────────────────────────────────────────
  const hasYolo = passArgs.includes("--yolo");
  const hasDashY = passArgs.includes("-Y");
  const yoloMode = hasYolo || hasDashY;

  if (isProjectPurge(passArgs) && yoloMode) {
    process.stderr.write(
      "JeanClaude -Y/--yolo dangerous mode is only valid for Claude Code sessions, not project purge.\n"
    );
    process.exit(1);
  }

  if (yoloMode) {
    const permMode = getPermissionMode(passArgs);
    if (permMode !== null && permMode !== "bypassPermissions") {
      process.stderr.write(
        "JeanClaude dangerous mode conflicts with explicit --permission-mode. Remove one.\n"
      );
      process.exit(1);
    }

    if (
      !hasFlag(passArgs, "--dangerously-skip-permissions") &&
      permMode !== "bypassPermissions"
    ) {
      passArgs = passArgs.filter((a) => a !== "--yolo" && a !== "-Y");
      passArgs.push("--dangerously-skip-permissions");
    } else {
      passArgs = passArgs.filter((a) => a !== "--yolo" && a !== "-Y");
    }

    if (process.env.JEANCLAUDE_QUIET !== "1") {
      process.stderr.write(
        "JeanClaude dangerous mode enabled: Claude Code permission prompts are bypassed for this session.\n"
      );
    }
  }

  // ── Gateway lifecycle (if gateway mode) ─────────────────────────
  let gatewayProcess: GatewayProcess | undefined;
  let gatewayUrl: string | undefined;

  if (jeanclaudeMode === "gateway") {
    const gwMode = resolveGatewayMode(cliGatewayMode ?? undefined);

    if (gwMode === "auto" || gwMode === "process") {
      try {
        gatewayProcess = await startGatewayProcess();
        gatewayUrl = gatewayProcess.url;
        if (process.env.JEANCLAUDE_QUIET !== "1") {
          process.stderr.write("jeanclaude: gateway started on " + gatewayUrl + "\n");
        }
      } catch (err: any) {
        process.stderr.write("jeanclaude: gateway failed to start: " + err.message + "\n");
        process.exit(1);
      }
    } else if (gwMode === "external") {
      gatewayUrl = cliGatewayUrl ?? process.env.JEANCLAUDE_GATEWAY_URL ?? undefined;
      if (!gatewayUrl) {
        process.stderr.write("jeanclaude: JEANCLAUDE_GATEWAY_URL not set for external gateway mode.\n");
        process.exit(1);
      }
      const healthy = await healthCheckGateway(gatewayUrl);
      if (!healthy) {
        process.stderr.write("jeanclaude: gateway health check failed: " + gatewayUrl + "\n");
        process.exit(1);
      }
      if (process.env.JEANCLAUDE_QUIET !== "1") {
        process.stderr.write("jeanclaude: using external gateway at " + gatewayUrl + "\n");
      }
    } else if (gwMode === "container") {
      process.stderr.write(
        "jeanclaude: container gateway mode is experimental. Use 'process' or 'external' mode.\n"
      );
    }
  }

  // ── Strip parent Anthropic auth before spawning ─────────────────
  stripParentAnthropicAuth();

  // ── Find claude binary ──────────────────────────────────────────
  const claudeBin = findClaudeBin();
  if (!claudeBin) {
    process.stderr.write(
      "jeanclaude: claude binary not found. Set JEANCLAUDE_CLAUDE_BIN or install @anthropic-ai/claude-code.\n"
    );
    process.exit(1);
  }

  // ── Launch ──────────────────────────────────────────────────────
  runClaude({ claudeBin, argv: passArgs, modelProfile, gatewayUrl, gatewayProcess });
}

main().catch((err) => {
  process.stderr.write("jeanclaude: fatal error: " + (err?.message ?? err) + "\n");
  process.exit(1);
});
