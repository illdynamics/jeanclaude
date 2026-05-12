/**
 * Apply thinking policy to a Messages API request body.
 * Injects `thinking` and `output_config` fields per Anthropic spec.
 */
export function applyThinkingPolicy(body, policy) {
  const base = body && typeof body === 'object' ? { ...body } : {};

  if (policy.thinking === 'enabled') {
    base.thinking = { type: 'enabled' };
    base.output_config = {
      ...(base.output_config && typeof base.output_config === 'object'
        ? base.output_config
        : {}),
      effort: policy.effort || 'max',
    };
    return base;
  }

  base.thinking = { type: 'disabled' };
  return base;
}

/**
 * Resolve a thinking policy from config fields.
 */
export function resolveThinkingPolicy(config) {
  return { thinking: config.thinking, effort: config.effort };
}
