const SECRET_KEY_PATTERN = /(authorization|x-api-key|x-subscription-token|anthropic_auth_token|anthropic_api_key|deepseek_api_key|brave_api_key|unstructured_api_key|response_api_key)/i;

export function redactValue(value) {
  if (typeof value !== 'string' || value.length === 0) return value;
  if (value.length <= 6) return '***';
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

export function redactObject(input) {
  if (Array.isArray(input)) {
    return input.map((v) => redactObject(v));
  }

  if (input && typeof input === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(input)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        out[key] = typeof value === 'string' ? redactValue(value) : '***';
      } else {
        out[key] = redactObject(value);
      }
    }
    return out;
  }

  return input;
}
