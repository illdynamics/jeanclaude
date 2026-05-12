const REDACT_KEYS = new Set([
  'deepseek_api_key',
  'anthropic_auth_token',
  'anthropic_api_key',
  'x-api-key',
  'authorization',
  'api_key',
  'apiKey',
]);

const SAFE_KEYS = new Set([
  'host',
  'port',
  'url',
  'path',
  'method',
  'status',
  'requestId',
]);

/**
 * Redact sensitive values. For long values (>8 chars), show first 4 + "..." + last 4.
 * For short values, show "***".
 */
export function redact(value) {
  if (value == null) return 'missing';
  const s = String(value);
  if (s.length <= 8) return '***';
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

/**
 * Check if a key name looks like it holds a secret.
 */
export function isSecretKey(key) {
  const lower = key.toLowerCase().replace(/[_-]/g, '');
  for (const k of REDACT_KEYS) {
    if (lower.includes(k.replace(/[_-]/g, ''))) return true;
  }
  return false;
}

/**
 * Check if a key is in the safe list and should never be redacted.
 */
export function isSafeKey(key) {
  return SAFE_KEYS.has(key);
}

/**
 * Check if a string value looks like a secret based on value patterns:
 * - Common API key prefixes: sk-, dsk-, pk-, key-, secret-
 * - Looks like a JWT (three base64url segments separated by dots)
 * - Long random-looking hex strings (>32 chars)
 */
export function isSecretValue(value) {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (!s) return false;

  // Known API key / secret prefixes
  const secretPrefixes = [
    /^sk-/i, /^dsk-/i, /^pk-/i, /^sk_/i,
    /^key-/i, /^secret-/i, /^token-/i,
  ];
  for (const pat of secretPrefixes) {
    if (pat.test(s)) return true;
  }

  // JWT pattern: header.payload.signature
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s) && s.length > 50) {
    return true;
  }

  // Long random-looking strings: >32 chars, mostly alphanumeric with symbols
  if (s.length > 32 && /^[A-Za-z0-9._\-\/+=]{33,}$/.test(s)) {
    return true;
  }

  return false;
}

/**
 * Redact all values in an object whose keys match secret patterns.
 */
export function redactObject(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isSecretKey(k) && typeof v === 'string') {
      out[k] = redact(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Walk a nested object/array recursively and redact:
 * - Values whose keys match secret patterns (key-based)
 * - String values that look like secrets (value-based)
 * - Preserve safe keys: host, port, url, path, method, status, requestId
 * - Preserve non-secret primitives and structural containers
 */
export function redactDeep(obj, _depth = 0) {
  if (_depth > 20) return obj; // guard recursion depth

  if (Array.isArray(obj)) {
    return obj.map(item => redactDeep(item, _depth + 1));
  }

  if (obj !== null && typeof obj === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
      // Safe keys are passed through untouched
      if (isSafeKey(key)) {
        out[key] = value;
        continue;
      }

      if (typeof value === 'string') {
        // Redact by key pattern OR by value pattern
        if (isSecretKey(key) || isSecretValue(value)) {
          out[key] = redact(value);
        } else {
          out[key] = value;
        }
      } else if (value !== null && typeof value === 'object') {
        // Recurse into nested objects/arrays
        out[key] = redactDeep(value, _depth + 1);
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  // Primitive — check value pattern
  if (typeof obj === 'string' && isSecretValue(obj)) {
    return redact(obj);
  }
  return obj;
}
