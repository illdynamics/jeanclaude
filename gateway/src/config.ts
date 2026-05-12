export function loadGatewayConfig(env = process.env) {
  const apiKey = env.DEEPSEEK_API_KEY || '';
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is required. Set it in the environment.');
  }

  const gatewayToken = env.JEANCLAUDE_GATEWAY_TOKEN || '';

  const modelProfile = env.JEANCLAUDE_MODEL_PROFILE || '';
  const explicitThinking = env.JEANCLAUDE_THINKING || '';
  const explicitEffort = env.JEANCLAUDE_REASONING_EFFORT || '';

  let thinking;
  let effort;

  // Explicit env vars take precedence over model profile
  if (explicitThinking === 'enabled' || explicitThinking === 'disabled') {
    thinking = explicitThinking;
    effort = explicitEffort || 'high';
  } else if (modelProfile) {
    // Derive thinking from modelProfile: profiles containing "thinking" enable it
    if (modelProfile.toLowerCase().includes('thinking')) {
      thinking = 'enabled';
      effort = explicitEffort || 'max';
    } else {
      thinking = 'disabled';
      effort = explicitEffort || 'high';
    }
  } else {
    thinking = 'disabled';
    effort = 'high';
  }

  return {
    host: env.JEANCLAUDE_GATEWAY_HOST || '127.0.0.1',
    port: Number(env.JEANCLAUDE_GATEWAY_PORT || 8080),
    upstreamBaseUrl: env.JEANCLAUDE_ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic',
    apiKey,
    gatewayToken,
    thinking,
    effort,
    modelProfile,
    logLevel: env.JEANCLAUDE_GATEWAY_LOG_LEVEL || 'info',
  };
}
