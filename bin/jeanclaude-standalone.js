#!/usr/bin/env node

// bin/jeanclaude-standalone.ts
import { spawn, execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync as readFileSync2, readdirSync, realpathSync, statSync, writeFileSync, unlinkSync, createReadStream, createWriteStream, watch } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// scripts/libdotenv.js
import { readFileSync } from "node:fs";
var ALLOWED_KEY_PATTERNS = [
  /^DEEPSEEK_API_KEY$/,
  /^RESPONSE_API_KEY$/,
  /^BRAVE_API_KEY$/,
  /^UNSTRUCTURED_API_KEY$/,
  /^UNSTRUCTURED_API_URL$/,
  /^OPENAI_API_KEY$/,
  /^ANTHROPIC_API_KEY$/,
  /^OPENROUTER_API_KEY$/,
  /^EMBEDDING_MODEL_ID$/,
  /^MEMORY_STORE_PASSWORD$/,
  /^HOST_UID$/,
  /^HOST_GID$/,
  /^CLAUDE_CODE_NPM_VERSION$/,
  /^OPEN_RESPONSES_IMAGE$/,
  /^OPEN_RESPONSES_TAG$/,
  /^RESPONSE_API_KEY_HEADER_NAME$/,
  /^JEANCLAUDE_/,
  /^OPEN_RESPONSES_/
];
function isKeyAllowed(key) {
  return ALLOWED_KEY_PATTERNS.some((p) => p.test(key));
}
function trimLeadingWs(s) {
  return s.replace(/^[ \t]+/, "");
}
function trimTrailingWs(s) {
  return s.replace(/[ \t]+$/, "");
}
function decodeEnvValue(raw) {
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    let inner = raw.slice(1, -1);
    inner = inner.replace(/\\"/g, '"');
    inner = inner.replace(/\\\\/g, "\\");
    return inner;
  }
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) {
    return raw.slice(1, -1);
  }
  return raw;
}
function loadDotenv(envFilePath) {
  if (process.env.JEANCLAUDE_NO_DOTENV === "1")
    return;
  let content;
  try {
    content = readFileSync(envFilePath, "utf-8");
  } catch {
    return;
  }
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    let trimmed = trimLeadingWs(line);
    if (trimmed === "" || trimmed.startsWith("#"))
      continue;
    if (/^export\s/i.test(trimmed)) {
      trimmed = trimLeadingWs(trimmed.replace(/^export\s*/i, ""));
    }
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1)
      continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let raw = trimLeadingWs(trimmed.slice(eqIdx + 1));
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
      continue;
    if (!raw.startsWith('"') && !raw.startsWith("'")) {
      const commentIdx = raw.indexOf("#");
      if (commentIdx !== -1)
        raw = raw.slice(0, commentIdx);
      raw = trimTrailingWs(raw);
    }
    const value = decodeEnvValue(raw);
    if (isKeyAllowed(key) && process.env[key] === void 0) {
      process.env[key] = value;
    }
  }
}

// bin/jeanclaude-standalone.ts
import http from "node:http";
import https from "node:https";
import net from "node:net";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
var REPO_ROOT = resolve(__dirname, "..");
var MODEL_PROFILES = {
  "v4-flash": {
    label: "v4-flash",
    backendModel: "deepseek-v4-flash",
    thinkingEnabled: false,
    effort: "low",
    description: "DeepSeek V4 Flash \u2013 fast, no thinking"
  },
  "v4-flash-thinking": {
    label: "v4-flash-thinking",
    backendModel: "deepseek-v4-flash",
    thinkingEnabled: true,
    effort: "max",
    description: "DeepSeek V4 Flash \u2013 with thinking, max effort"
  },
  "v4-pro": {
    label: "v4-pro",
    backendModel: "deepseek-v4-pro",
    thinkingEnabled: false,
    effort: "low",
    description: "DeepSeek V4 Pro \u2013 largest, no thinking"
  },
  "v4-pro-thinking": {
    label: "v4-pro-thinking",
    backendModel: "deepseek-v4-pro",
    thinkingEnabled: true,
    effort: "max",
    description: "DeepSeek V4 Pro \u2013 with thinking, max effort (default)"
  }
};
var VALID_PROFILES = Object.keys(MODEL_PROFILES);
var DEFAULT_PROFILE = "v4-pro-thinking";
var REJECTED_MODEL_NAMES = /* @__PURE__ */ new Set([
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
  "o3"
]);
function resolveModelProfile(profile) {
  if (MODEL_PROFILES[profile]) {
    return MODEL_PROFILES[profile];
  }
  if (REJECTED_MODEL_NAMES.has(profile) || /^(claude-|gpt-|o[0-9])/.test(profile)) {
    process.stderr.write(
      `jeanclaude: Unknown model: ${profile}. JeanClaude supports: ${VALID_PROFILES.join(", ")}
`
    );
    process.exit(1);
  }
  process.stderr.write(
    `jeanclaude: Unknown model: ${profile}. JeanClaude supports: ${VALID_PROFILES.join(", ")}
`
  );
  process.exit(1);
}
function getVersion() {
  try {
    const raw = readFileSync2(resolve(REPO_ROOT, "package.json"), "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.version) return parsed.version;
  } catch {
  }
  return "0.2.1";
}
function maybeLoadDotenv() {
  if (process.env.JEANCLAUDE_NO_DOTENV !== "1") {
    const envFile = resolve(REPO_ROOT, ".env");
    if (existsSync(envFile)) {
      loadDotenv(envFile);
    }
  }
}
function getJeanclaudeConfigDir() {
  return process.env.JEANCLAUDE_CONFIG_HOME ?? resolve(process.env.XDG_CONFIG_HOME ?? resolve(process.env.HOME ?? "/tmp", ".config"), "jeanclaude");
}
function getJeanclaudeStateDir() {
  return process.env.JEANCLAUDE_STATE_HOME ?? resolve(process.env.XDG_STATE_HOME ?? resolve(process.env.HOME ?? "/tmp", ".local", "state"), "jeanclaude");
}
function getJeanclaudeCacheDir() {
  return process.env.JEANCLAUDE_CACHE_HOME ?? resolve(process.env.XDG_CACHE_HOME ?? resolve(process.env.HOME ?? "/tmp", ".cache"), "jeanclaude");
}
function ensureStateDirs() {
  const dirs = [
    resolve(getJeanclaudeStateDir(), "run"),
    resolve(getJeanclaudeStateDir(), "log"),
    getJeanclaudeCacheDir(),
    getJeanclaudeConfigDir()
  ];
  for (const d of dirs) {
    try {
      mkdirSync(d, { recursive: true, mode: 448 });
    } catch {
    }
  }
}
var SECRET_KEYS = /* @__PURE__ */ new Set([
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
  "CODESEEQ_BRIDGE_API_KEY"
]);
function looksLikeSecret(val) {
  if (val.length < 8) return false;
  return /^sk-/.test(val) || /^sk-ant-/.test(val) || /^sk-proj-/.test(val) || /^[A-Za-z0-9+/=]{20,}$/.test(val);
}
function redact(val) {
  if (val.length <= 8) return "***";
  return val.slice(0, 4) + "..." + val.slice(-4);
}
function redactEnvValue(key, val) {
  if (SECRET_KEYS.has(key) || looksLikeSecret(val)) return redact(val);
  return val;
}
var ANTHROPIC_AUTH_VARS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"];
var CLAUDE_SESSION_VARS = [
  "CLAUDE_ACCESS_TOKEN",
  "CLAUDE_REFRESH_TOKEN",
  "CLAUDE_ORG_ID",
  "CLAUDE_SESSION_ID"
];
function stripParentAnthropicAuth() {
  for (const v of ANTHROPIC_AUTH_VARS) delete process.env[v];
  for (const v of CLAUDE_SESSION_VARS) delete process.env[v];
}
var DEPRECATED_ENV_MAP = {
  JEANCLAUDE_MODEL: {
    newKey: "JEANCLAUDE_MODEL_PROFILE",
    deprecationMsg: "JEANCLAUDE_MODEL is deprecated. Use JEANCLAUDE_MODEL_PROFILE instead."
  },
  JEANCLAUDE_BRIDGE_MODE: {
    newKey: "JEANCLAUDE_GATEWAY_MODE",
    deprecationMsg: "JEANCLAUDE_BRIDGE_MODE is deprecated. Use JEANCLAUDE_GATEWAY_MODE instead."
  },
  RESPONSE_API_KEY: {
    newKey: "JEANCLAUDE_OPEN_RESPONSES_API_KEY",
    deprecationMsg: "RESPONSE_API_KEY is deprecated. Use JEANCLAUDE_OPEN_RESPONSES_API_KEY instead."
  },
  RESPONSES_API_KEY: {
    newKey: "JEANCLAUDE_OPEN_RESPONSES_API_KEY",
    deprecationMsg: "RESPONSES_API_KEY is deprecated. Use JEANCLAUDE_OPEN_RESPONSES_API_KEY instead."
  }
};
var _warnedDeprecations = /* @__PURE__ */ new Set();
function warnOnce(msg) {
  if (_warnedDeprecations.has(msg)) return;
  _warnedDeprecations.add(msg);
  process.stderr.write("jeanclaude: " + msg + "\n");
}
function applyDeprecatedEnvAliases() {
  for (const [oldKey, { newKey, deprecationMsg }] of Object.entries(DEPRECATED_ENV_MAP)) {
    if (process.env[oldKey] !== void 0 && process.env[oldKey] !== "") {
      warnOnce(deprecationMsg);
      if (process.env[newKey] === void 0 || process.env[newKey] === "") {
        process.env[newKey] = process.env[oldKey];
      }
    }
  }
}
function resolveJeanclaudeMode(cliMode) {
  const envMode = (process.env.JEANCLAUDE_MODE ?? "").toLowerCase();
  const mode = (cliMode ?? envMode) || "auto";
  if (mode === "direct" || mode === "gateway" || mode === "auto") {
    return mode;
  }
  if (mode === "bridge") {
    warnOnce("JEANCLAUDE_MODE=bridge is deprecated. Use 'gateway' instead.");
    return "gateway";
  }
  process.stderr.write("jeanclaude: Unknown JEANCLAUDE_MODE '" + mode + "'. Must be direct, gateway, or auto.\n");
  process.exit(1);
}
function resolveGatewayMode(cliMode) {
  const envMode = (process.env.JEANCLAUDE_GATEWAY_MODE ?? "").toLowerCase();
  const mode = (cliMode ?? envMode) || "auto";
  if (mode === "process" || mode === "container" || mode === "external" || mode === "auto") {
    return mode;
  }
  process.stderr.write("jeanclaude: Unknown JEANCLAUDE_GATEWAY_MODE '" + mode + "'. Must be process, container, external, or auto.\n");
  process.exit(1);
}
function findClaudeBin() {
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
    let real;
    try {
      real = realpathSync(candidate);
    } catch {
      real = candidate;
    }
    if (real === jeanclaudeWrapper || real === jeanclaudeStandalone || real === selfPath) continue;
    if (real === resolve(REPO_ROOT, "bin", "jeanclaude-standalone")) continue;
    if (real === resolve(REPO_ROOT, "bin", "jeanclaude")) continue;
    return candidate;
  }
  return null;
}
function findGatewayServer() {
  const candidates = [
    resolve(REPO_ROOT, "gateway", "dist", "src", "server.js"),
    resolve(REPO_ROOT, "gateway", "src", "server.ts")
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  process.stderr.write("jeanclaude: gateway server not found. Build the gateway package first.\n");
  process.exit(1);
}
function pickFreePort() {
  return new Promise((resolve2, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        server.close(() => resolve2(port));
      } else {
        server.close(() => reject(new Error("Could not determine port")));
      }
    });
    server.on("error", reject);
  });
}
function healthCheckGateway(url, timeoutMs = 1e4) {
  return new Promise((resolve2) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      resolve2(false);
    }, timeoutMs);
    const normalizedUrl = url.replace(/\/+$/, "");
    const mod = normalizedUrl.startsWith("https") ? https : http;
    mod.get(normalizedUrl + "/healthz", { signal: controller.signal }, (res) => {
      clearTimeout(timer);
      let data = "";
      res.on("data", (chunk) => {
        data += chunk.toString();
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve2(parsed.ok === true);
        } catch {
          resolve2(res.statusCode === 200);
        }
      });
    }).on("error", () => {
      clearTimeout(timer);
      resolve2(false);
    });
  });
}
async function startGatewayProcess() {
  const gatewayServer = findGatewayServer();
  const port = await pickFreePort();
  const host = "127.0.0.1";
  const url = "http://" + host + ":" + port;
  const token = "jeanclaude-gateway-" + Math.random().toString(36).slice(2, 10);
  const gatewayEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== void 0) gatewayEnv[k] = v;
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
  let logStream = null;
  try {
    mkdirSync(logDir, { recursive: true });
    logStream = createWriteStream(resolve(logDir, "gateway.log"), { flags: "a" });
  } catch {
  }
  return new Promise((resolveGateway, rejectGateway) => {
    const child = spawn("node", [gatewayServer], {
      stdio: ["pipe", "pipe", "pipe"],
      env: gatewayEnv
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
            const lines = readFileSync2(logFile, "utf-8").split(/\r?\n/);
            logTail = lines.slice(-10).join("\n");
          }
        } catch {
        }
        rejectGateway(new Error("Gateway failed to start within " + startupTimeoutMs / 1e3 + "s. Last log lines:\n" + logTail));
      }
    }, startupTimeoutMs);
    function onOutput(data) {
      if (logStream) logStream.write(data);
    }
    child.stdout?.on("data", onOutput);
    child.stderr?.on("data", onOutput);
    const pollInterval = 100;
    const maxAttempts = Math.ceil(startupTimeoutMs / pollInterval);
    let attempts = 0;
    const pollTimer = setInterval(async () => {
      attempts++;
      try {
        const ok = await healthCheckGateway(url, 2e3);
        if (ok) {
          started = true;
          clearTimeout(startupTimeout);
          clearInterval(pollTimer);
          const pidDir = resolve(getJeanclaudeStateDir(), "run");
          try {
            mkdirSync(pidDir, { recursive: true });
            writeFileSync(resolve(pidDir, "gateway.pid"), String(child.pid ?? ""), "utf-8");
          } catch {
          }
          resolveGateway({ child, port, host, url, token });
        }
      } catch {
      }
      if (attempts >= maxAttempts && !started) {
        clearInterval(pollTimer);
      }
    }, pollInterval);
    child.on("error", (err) => {
      clearTimeout(startupTimeout);
      clearInterval(pollTimer);
      rejectGateway(err);
    });
    child.on("exit", (code) => {
      if (!started) {
        clearTimeout(startupTimeout);
        clearInterval(pollTimer);
        rejectGateway(new Error("Gateway exited prematurely with code " + code));
      }
    });
  });
}
async function stopGatewayByPid() {
  const pidFile = resolve(getJeanclaudeStateDir(), "run", "gateway.pid");
  try {
    const pidStr = readFileSync2(pidFile, "utf-8").trim();
    const pid = Number(pidStr);
    if (pid > 0) {
      try {
        process.kill(pid, "SIGTERM");
        unlinkSync(pidFile);
        return true;
      } catch (e) {
        if (e.code === "ESRCH") {
          try {
            unlinkSync(pidFile);
          } catch {
          }
          return true;
        }
        return false;
      }
    }
  } catch {
    return false;
  }
  return false;
}
function tailGatewayLogs() {
  const logFile = resolve(getJeanclaudeStateDir(), "log", "gateway.log");
  if (!existsSync(logFile)) {
    process.stderr.write("jeanclaude: gateway log file not found at " + logFile + "\n");
    process.exit(1);
  }
  const stream = createReadStream(logFile, { encoding: "utf-8" });
  stream.pipe(process.stdout);
  stream.on("end", () => process.exit(0));
  stream.on("error", (err) => {
    process.stderr.write("jeanclaude: error reading gateway logs: " + err.message + "\n");
    process.exit(1);
  });
  try {
    const watcher = watch(logFile, () => {
    });
    process.on("SIGINT", () => {
      watcher.close();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      watcher.close();
      process.exit(0);
    });
  } catch {
  }
}
function setupClaudeEnv(modelProfile, gatewayUrl, gatewayToken) {
  const deepseekKey = process.env.DEEPSEEK_API_KEY ?? "";
  if (!deepseekKey) {
    process.stderr.write(
      "jeanclaude: DEEPSEEK_API_KEY is required. JeanClaude does not use Anthropic/Claude authentication.\n"
    );
    process.exit(1);
  }
  const mode = resolveJeanclaudeMode(
    process.env._JEANCLAUDE_CLI_MODE
  );
  const isGatewayEffective = mode === "gateway" || mode === "auto" && !!gatewayUrl;
  if (isGatewayEffective && gatewayUrl) {
    process.env.ANTHROPIC_BASE_URL = gatewayUrl.replace(/\/+$/, "");
    process.env.ANTHROPIC_AUTH_TOKEN = gatewayToken ?? "jeanclaude-gateway";
    process.env.ANTHROPIC_API_KEY = gatewayToken ?? "jeanclaude-gateway";
    delete process.env.DEEPSEEK_API_KEY;
  } else {
    process.env.ANTHROPIC_BASE_URL = process.env.JEANCLAUDE_ANTHROPIC_BASE_URL ?? "https://api.deepseek.com/anthropic";
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
function hasFlag(argv, flag) {
  return argv.some((a) => a === flag || a.startsWith(flag + "="));
}
function getFlagValue(argv, flag) {
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
function getPermissionMode(argv) {
  return getFlagValue(argv, "--permission-mode");
}
function cmdVersion() {
  console.log(getVersion());
  process.exit(0);
}
function cmdEnv() {
  const keys = Object.keys(process.env).sort();
  for (const k of keys) {
    const val = process.env[k] ?? "";
    console.log(k + "=" + redactEnvValue(k, val));
  }
  process.exit(0);
}
function cmdModels(args) {
  const jsonFlag = args.includes("--json");
  if (jsonFlag) {
    const profiles = {};
    for (const [name, p] of Object.entries(MODEL_PROFILES)) {
      profiles[name] = {
        backendModel: p.backendModel,
        thinkingEnabled: p.thinkingEnabled,
        effort: p.effort,
        description: p.description
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
async function cmdDoctor() {
  let ok = true;
  const problems = [];
  const checks = [];
  const claudeBin = findClaudeBin();
  if (!claudeBin) {
    ok = false;
    problems.push("claude binary not found on PATH and JEANCLAUDE_CLAUDE_BIN not set");
    checks.push("claude binary: MISSING");
  } else {
    checks.push("claude binary: " + claudeBin);
  }
  if (claudeBin) {
    try {
      const helpOut = await execCapture(claudeBin, ["--help"]);
      if (helpOut.includes("  -Y") || helpOut.includes("	-Y") || /[^a-zA-Z]-Y[, \t]/.test(helpOut)) {
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
  const dsk = process.env.DEEPSEEK_API_KEY ?? "";
  if (!dsk) {
    ok = false;
    problems.push("DEEPSEEK_API_KEY not set");
    checks.push("DeepSeek API key: MISSING");
  } else {
    checks.push("DeepSeek API key: " + redact(dsk));
  }
  const rawProfile = process.env.JEANCLAUDE_MODEL_PROFILE ?? DEFAULT_PROFILE;
  let profileValid = true;
  try {
    resolveModelProfile(rawProfile);
  } catch {
    profileValid = false;
  }
  if (!profileValid) {
    ok = false;
    problems.push("Invalid model profile: " + rawProfile + ". Valid: " + VALID_PROFILES.join(", "));
  }
  checks.push("Model profile: " + rawProfile + (profileValid ? " (valid)" : " (INVALID)"));
  const mode = resolveJeanclaudeMode();
  checks.push("JeanClaude mode: " + mode);
  const baseUrl = process.env.ANTHROPIC_BASE_URL ?? process.env.JEANCLAUDE_ANTHROPIC_BASE_URL ?? "https://api.deepseek.com/anthropic";
  checks.push("ANTHROPIC_BASE_URL: " + baseUrl);
  const hasParentAuth = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  if (hasParentAuth) {
    checks.push("Parent Anthropic auth: DETECTED (will be stripped from child)");
  } else {
    checks.push("Parent Anthropic auth: clean (none detected)");
  }
  if (mode === "gateway") {
    const gwMode = resolveGatewayMode();
    checks.push("Gateway mode: " + gwMode);
    if (gwMode === "process") {
      try {
        findGatewayServer();
        checks.push("Gateway server: found");
      } catch {
        ok = false;
        problems.push("Gateway server not found. Build the gateway package.");
        checks.push("Gateway server: MISSING");
      }
    }
    if (gwMode === "external") {
      const gwUrl = process.env.JEANCLAUDE_GATEWAY_URL ?? "";
      if (!gwUrl) {
        ok = false;
        problems.push("JEANCLAUDE_GATEWAY_URL not set for external gateway mode");
        checks.push("Gateway URL: MISSING");
      } else {
        checks.push("Gateway URL: " + gwUrl);
        const healthy = await healthCheckGateway(gwUrl);
        if (!healthy) {
          ok = false;
          problems.push("Gateway health check failed: " + gwUrl);
          checks.push("Gateway health: UNREACHABLE");
        } else checks.push("Gateway health: OK");
      }
    }
  }
  try {
    const stateDir = getJeanclaudeStateDir();
    const testFile = resolve(stateDir, "run", ".doctor-test");
    writeFileSync(testFile, "ok");
    unlinkSync(testFile);
    checks.push("State dir permissions: OK");
  } catch {
    try {
      const runDir = resolve(getJeanclaudeStateDir(), "run");
      mkdirSync(runDir, { recursive: true });
      unlinkSync(runDir);
      checks.push("State dir permissions: OK (created)");
    } catch {
      ok = false;
      problems.push("Cannot create state directory: " + getJeanclaudeStateDir());
      checks.push("State dir permissions: FAILED");
    }
  }
  for (const v of [...ANTHROPIC_AUTH_VARS, ...CLAUDE_SESSION_VARS]) {
    if (process.env[v]) checks.push("Parent env " + v + ": WILL BE STRIPPED");
  }
  const BANNED_PATHS = [".codeseeq", ".env", ".DS_Store", "claude-code", "open-responses"];
  const foundBanned = [];
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
            const contents = readFileSync2(fp, "utf-8");
            for (const rawModel of ["deepseek-v4-flash", "deepseek-v4-pro"]) {
              if (contents.includes(rawModel)) {
                ok = false;
                problems.push("Config file " + f + " exposes raw backend model: " + rawModel);
                configClean = false;
              }
            }
          }
        } catch {
        }
      }
      checks.push("Config templates: " + (configClean ? "clean" : "EXPOSE RAW MODELS"));
    } else {
      checks.push("Config templates: no config directory");
    }
  } catch {
    checks.push("Config templates: could not scan");
  }
  const gwToken = process.env.ANTHROPIC_AUTH_TOKEN ?? "";
  if (gwToken && gwToken !== "jeanclaude-gateway") {
    const tokenLen = gwToken.length;
    checks.push("Gateway token: present (length " + tokenLen + ")");
  } else if (gwToken === "jeanclaude-gateway") {
    checks.push("Gateway token: default placeholder");
  } else {
    checks.push("Gateway token: not set");
  }
  try {
    const libdotenv = resolve(REPO_ROOT, "scripts", "libdotenv.js");
    if (existsSync(libdotenv)) {
      checks.push("Package integrity: libdotenv present");
    } else {
      checks.push("Package integrity: libdotenv MISSING");
    }
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
  if (problems.length > 0) {
    console.log("\nProblems:");
    for (const p of problems) console.log("  \u2717 " + p);
  }
  if (ok) console.log("\n\u2713 All checks passed.");
  process.exit(ok ? 0 : 1);
}
function execCapture(cmd, args) {
  return new Promise((resolve2, reject) => {
    execFile(cmd, args, { timeout: 5e3, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve2(stdout);
    });
  });
}
async function cmdGateway(subArgs) {
  const action = subArgs[0];
  switch (action) {
    case "serve": {
      process.stderr.write("[jeanclaude] Starting gateway...\n");
      try {
        const gw = await startGatewayProcess();
        process.stderr.write("[jeanclaude] Gateway listening on " + gw.url + " (PID " + gw.child.pid + ")\n");
        process.on("SIGINT", () => {
          gw.child.kill("SIGINT");
          process.exit(0);
        });
        process.on("SIGTERM", () => {
          gw.child.kill("SIGTERM");
          process.exit(0);
        });
        gw.child.on("exit", (code) => {
          process.exit(code ?? 0);
        });
        gw.child.stdout?.pipe(process.stdout);
        gw.child.stderr?.pipe(process.stderr);
      } catch (err) {
        process.stderr.write("[jeanclaude] Gateway failed to start: " + err.message + "\n");
        process.exit(1);
      }
      return;
    }
    case "health": {
      const gwUrl = process.env.JEANCLAUDE_GATEWAY_URL ?? "http://127.0.0.1:8765";
      const healthy = await healthCheckGateway(gwUrl);
      if (healthy) {
        console.log("Gateway is healthy at " + gwUrl);
        process.exit(0);
      } else {
        console.log("Gateway is unreachable at " + gwUrl);
        process.exit(1);
      }
      return;
    }
    case "stop": {
      const stopped = await stopGatewayByPid();
      if (stopped) {
        console.log("Gateway stopped.");
        process.exit(0);
      } else {
        console.log("No running gateway found (no PID file).");
        process.exit(1);
      }
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
function isProjectPurge(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "project" && argv[i + 1] === "purge") return true;
  }
  return false;
}
function forwardSignals(child) {
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
  for (const sig of signals) {
    process.on(sig, () => {
      if (child.pid && !child.killed) {
        child.kill(sig);
      }
    });
  }
}
function runClaude(opts) {
  const { claudeBin, argv, modelProfile, gatewayUrl, gatewayProcess } = opts;
  const childEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== void 0) childEnv[k] = v;
  }
  for (const v of ANTHROPIC_AUTH_VARS) delete childEnv[v];
  for (const v of CLAUDE_SESSION_VARS) delete childEnv[v];
  setupClaudeEnv(modelProfile, gatewayUrl, gatewayProcess?.token);
  const CRITICAL_ENV = [
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "CLAUDE_CODE_SUBAGENT_MODEL",
    "CLAUDE_CODE_EFFORT_LEVEL",
    "CLAUDE_CODE_DISABLE_THINKING",
    "DEEPSEEK_API_KEY",
    "JEANCLAUDE_MODEL_PROFILE"
  ];
  for (const k of CRITICAL_ENV) {
    const val = process.env[k];
    if (val !== void 0 && val !== null) childEnv[k] = val;
  }
  const child = spawn(claudeBin, argv, {
    stdio: "inherit",
    env: childEnv
  });
  forwardSignals(child);
  const cleanup = () => {
    if (gatewayProcess && gatewayProcess.child && !gatewayProcess.child.killed) {
      if (process.env.JEANCLAUDE_GATEWAY_KEEPALIVE !== "1") {
        gatewayProcess.child.kill("SIGTERM");
        const pidFile = resolve(getJeanclaudeStateDir(), "run", "gateway.pid");
        try {
          unlinkSync(pidFile);
        } catch {
        }
      }
    }
  };
  child.on("exit", (code, signal) => {
    cleanup();
    if (signal) {
      const sigMap = { SIGINT: 2, SIGTERM: 15, SIGHUP: 1 };
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
async function main() {
  maybeLoadDotenv();
  applyDeprecatedEnvAliases();
  ensureStateDirs();
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes("--version")) {
    const firstNonFlag = rawArgs.find((a) => !a.startsWith("-"));
    if (!firstNonFlag || firstNonFlag === "--version") {
      cmdVersion();
    }
  }
  if (rawArgs[0] === "models") {
    cmdModels(rawArgs.slice(1));
    return;
  }
  if (rawArgs[0] === "doctor") {
    await cmdDoctor();
    return;
  }
  if (rawArgs[0] === "env") {
    cmdEnv();
    return;
  }
  if (rawArgs[0] === "gateway") {
    await cmdGateway(rawArgs.slice(1));
    return;
  }
  let passArgs = [...rawArgs];
  let cliModelProfile = null;
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
  let cliJeanclaudeMode = null;
  for (let i = passArgs.length - 1; i >= 0; i--) {
    if (passArgs[i] === "--jeanclaude-mode" && i + 1 < passArgs.length) {
      cliJeanclaudeMode = passArgs[i + 1];
      passArgs.splice(i, 2);
    } else if (passArgs[i].startsWith("--jeanclaude-mode=")) {
      cliJeanclaudeMode = passArgs[i].split("=", 2)[1];
      passArgs.splice(i, 1);
    }
  }
  let cliGatewayMode = null;
  for (let i = passArgs.length - 1; i >= 0; i--) {
    if (passArgs[i] === "--gateway-mode" && i + 1 < passArgs.length) {
      cliGatewayMode = passArgs[i + 1];
      passArgs.splice(i, 2);
    } else if (passArgs[i].startsWith("--gateway-mode=")) {
      cliGatewayMode = passArgs[i].split("=", 2)[1];
      passArgs.splice(i, 1);
    }
  }
  let cliGatewayUrl = null;
  for (let i = passArgs.length - 1; i >= 0; i--) {
    if (passArgs[i] === "--gateway-url" && i + 1 < passArgs.length) {
      cliGatewayUrl = passArgs[i + 1];
      passArgs.splice(i, 2);
    } else if (passArgs[i].startsWith("--gateway-url=")) {
      cliGatewayUrl = passArgs[i].split("=", 2)[1];
      passArgs.splice(i, 1);
    }
  }
  const resolvedProfileName = cliModelProfile ?? (process.env.JEANCLAUDE_MODEL_PROFILE && process.env.JEANCLAUDE_MODEL_PROFILE !== "" ? process.env.JEANCLAUDE_MODEL_PROFILE : void 0) ?? DEFAULT_PROFILE;
  const modelProfile = resolveModelProfile(resolvedProfileName);
  process.env.JEANCLAUDE_MODEL_PROFILE = resolvedProfileName;
  if (cliModelProfile && process.env.JEANCLAUDE_QUIET !== "1") {
    process.stderr.write(
      "jeanclaude: using model profile '" + resolvedProfileName + "' -> backend '" + modelProfile.backendModel + "'\n"
    );
  }
  const jeanclaudeMode = resolveJeanclaudeMode(cliJeanclaudeMode ?? void 0);
  process.env._JEANCLAUDE_CLI_MODE = jeanclaudeMode;
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
    if (!hasFlag(passArgs, "--dangerously-skip-permissions") && permMode !== "bypassPermissions") {
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
  let gatewayProcess;
  let gatewayUrl;
  if (jeanclaudeMode === "gateway") {
    const gwMode = resolveGatewayMode(cliGatewayMode ?? void 0);
    if (gwMode === "auto" || gwMode === "process") {
      try {
        gatewayProcess = await startGatewayProcess();
        gatewayUrl = gatewayProcess.url;
        if (process.env.JEANCLAUDE_QUIET !== "1") {
          process.stderr.write("jeanclaude: gateway started on " + gatewayUrl + "\n");
        }
      } catch (err) {
        process.stderr.write("jeanclaude: gateway failed to start: " + err.message + "\n");
        process.exit(1);
      }
    } else if (gwMode === "external") {
      gatewayUrl = cliGatewayUrl ?? process.env.JEANCLAUDE_GATEWAY_URL ?? void 0;
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
  stripParentAnthropicAuth();
  const claudeBin = findClaudeBin();
  if (!claudeBin) {
    process.stderr.write(
      "jeanclaude: claude binary not found. Set JEANCLAUDE_CLAUDE_BIN or install @anthropic-ai/claude-code.\n"
    );
    process.exit(1);
  }
  runClaude({ claudeBin, argv: passArgs, modelProfile, gatewayUrl, gatewayProcess });
}
main().catch((err) => {
  process.stderr.write("jeanclaude: fatal error: " + (err?.message ?? err) + "\n");
  process.exit(1);
});
