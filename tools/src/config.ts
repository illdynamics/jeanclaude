import path from 'node:path';

function normalizeSwitch(value, fallback) {
  if (!value) return fallback;
  const v = String(value).trim().toLowerCase();
  if (v === 'on' || v === 'enabled' || v === '1' || v === 'true' || v === 'yes') return 'on';
  if (v === 'off' || v === 'disabled' || v === '0' || v === 'false' || v === 'no') return 'off';
  return fallback;
}

const WARNED_DEPRECATED = new Set();

function warnOnce(key, message) {
  if (!WARNED_DEPRECATED.has(key)) {
    WARNED_DEPRECATED.add(key);
    console.warn(message);
  }
}

function resolveApiKey(env) {
  const canonical = env.JEANCLAUDE_OPEN_RESPONSES_API_KEY;
  if (canonical) return canonical;

  const legacyResponse = env.RESPONSE_API_KEY;
  const legacyResponses = env.RESPONSES_API_KEY;

  if (legacyResponse && legacyResponses) {
    warnOnce('RESPONSE_API_KEY+RESPONSES_API_KEY',
      '[jeanclaude] Deprecated env vars RESPONSE_API_KEY and RESPONSES_API_KEY both set, but JEANCLAUDE_OPEN_RESPONSES_API_KEY is not. Use JEANCLAUDE_OPEN_RESPONSES_API_KEY instead.');
    return legacyResponse;
  }

  if (legacyResponse) {
    warnOnce('RESPONSE_API_KEY',
      '[jeanclaude] Deprecated env var RESPONSE_API_KEY is set. Use JEANCLAUDE_OPEN_RESPONSES_API_KEY instead.');
    return legacyResponse;
  }

  if (legacyResponses) {
    warnOnce('RESPONSES_API_KEY',
      '[jeanclaude] Deprecated env var RESPONSES_API_KEY is set. Use JEANCLAUDE_OPEN_RESPONSES_API_KEY instead.');
    return legacyResponses;
  }

  return '';
}

export function loadConfig(env) {
  const effectiveEnv = env || process.env;
  const cwd = process.cwd();
  const defaultStore = path.resolve(cwd, '.jeanclaude/documents');

  return {
    openResponsesUrl: (effectiveEnv.JEANCLAUDE_OPEN_RESPONSES_URL || 'http://open-responses:8080').replace(/\/$/, ''),
    openResponsesModel: effectiveEnv.JEANCLAUDE_OPEN_RESPONSES_MODEL || 'deepseek/deepseek-v4-flash',
    responseApiKey: resolveApiKey(effectiveEnv),
    deepseekApiKey: effectiveEnv.DEEPSEEK_API_KEY || '',
    webSearch: normalizeSwitch(effectiveEnv.JEANCLAUDE_WEB_SEARCH, 'off'),
    documents: normalizeSwitch(effectiveEnv.JEANCLAUDE_DOCUMENTS, 'off'),
    braveApiKey: effectiveEnv.BRAVE_API_KEY || effectiveEnv.BRAVE_SEARCH_API_KEY || '',
    unstructuredApiKey: effectiveEnv.UNSTRUCTURED_API_KEY || '',
    unstructuredApiUrl: effectiveEnv.UNSTRUCTURED_API_URL || 'https://api.unstructuredapp.io/general/v0/general',
    documentStore: effectiveEnv.JEANCLAUDE_DOCUMENT_STORE || defaultStore,
    workspaceRoot: effectiveEnv.JEANCLAUDE_WORKSPACE_ROOT || cwd,
    allowLocalFetch: effectiveEnv.JEANCLAUDE_ALLOW_LOCAL_FETCH === '1',
    maxFetchBytes: Number(effectiveEnv.JEANCLAUDE_MAX_FETCH_BYTES || 1000000),
    maxIngestBytes: Number(effectiveEnv.JEANCLAUDE_MAX_INGEST_BYTES || 10000000),
    logLevel: effectiveEnv.JEANCLAUDE_LOG_LEVEL || 'info',
    debugBody: effectiveEnv.JEANCLAUDE_DEBUG_BODY === '1'
  };
}
