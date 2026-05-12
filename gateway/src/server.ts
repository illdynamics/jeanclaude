import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { loadGatewayConfig } from './config.js';
import { applyThinkingPolicy, resolveThinkingPolicy } from './thinking-policy.js';
import { forwardAnthropicRequest } from './deepseek-anthropic-client.js';
import { relayStreamingResponse } from './streaming.js';
import { redact, redactObject } from './redact.js';
import { configureLogging } from './logging.js';

const log = configureLogging(process.env.JEANCLAUDE_GATEWAY_LOG_LEVEL || 'info');

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function isLocalhost(req) {
  const addr = req.socket?.remoteAddress || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function jsonResponse(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function generateRequestId() {
  return randomUUID();
}

/**
 * Extract the client token from Authorization (Bearer) or X-API-Key header.
 * Returns the token string or null if not present.
 */
function extractClientToken(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader) {
    // Support "Bearer <token>" format
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();
    // Also allow raw token value (non-Bearer)
    return authHeader.trim();
  }
  const apiKeyHeader = req.headers['x-api-key'] || '';
  if (apiKeyHeader) return apiKeyHeader.trim();
  return null;
}

/**
 * Validate the client token against the configured gateway token.
 * Returns true if the request is authorized, false otherwise.
 */
function validateToken(req, config) {
  // If no gateway token is configured, allow all requests
  if (!config.gatewayToken) return true;

  const clientToken = extractClientToken(req);
  if (!clientToken) return false;

  // Constant-time comparison
  if (clientToken.length !== config.gatewayToken.length) return false;
  let mismatch = 0;
  for (let i = 0; i < clientToken.length; i++) {
    mismatch |= clientToken.charCodeAt(i) ^ config.gatewayToken.charCodeAt(i);
  }
  return mismatch === 0;
}

export function createServer(config = loadGatewayConfig()) {
  return http.createServer(async (req, res) => {
    const requestId = generateRequestId();
    const start = Date.now();

    try {
      const url = req.url || '/';
      const method = req.method || 'GET';

      log.info(`${method} ${url}`, { requestId });

      // ---- HEALTH CHECK ----
      // Always allowed without token when bound to localhost
      if (url === '/healthz') {
        // If not localhost and gateway token is set, enforce token check
        if (!isLocalhost(req) && config.gatewayToken) {
          if (!validateToken(req, config)) {
            jsonResponse(res, 401, { error: 'unauthorized', message: 'invalid or missing gateway token' });
            return;
          }
        }
        jsonResponse(res, 200, { ok: true, version: '0.2.1', mode: 'gateway' });
        return;
      }

      // ---- DEBUG CONFIG (localhost only) ----
      if (url === '/debug/config-redacted') {
        if (!isLocalhost(req)) {
          jsonResponse(res, 403, { error: 'forbidden', message: 'only available on localhost' });
          return;
        }
        jsonResponse(res, 200, {
          host: config.host,
          port: config.port,
          upstreamBaseUrl: config.upstreamBaseUrl,
          thinking: config.thinking,
          effort: config.effort,
          modelProfile: config.modelProfile,
          logLevel: config.logLevel,
          apiKey: redact(config.apiKey),
        });
        return;
      }

      // ---- TOKEN VALIDATION ----
      if (!validateToken(req, config)) {
        jsonResponse(res, 401, { error: 'unauthorized', message: 'invalid or missing gateway token' });
        return;
      }

      // ---- VALIDATE ENDPOINT ----
      if (url !== '/v1/messages' && url !== '/v1/messages/count_tokens') {
        jsonResponse(res, 404, { error: 'not_found', message: `unknown endpoint: ${url}` });
        return;
      }

      // ---- METHOD CHECK ----
      if (method !== 'POST') {
        jsonResponse(res, 405, { error: 'method_not_allowed', message: 'only POST is supported' });
        return;
      }

      // ---- API KEY CHECK ----
      if (!config.apiKey) {
        jsonResponse(res, 500, { error: 'missing_deepseek_api_key' });
        return;
      }

      // ---- READ BODY ----
      let rawBody = '';
      try {
        rawBody = await readBody(req);
      } catch {
        jsonResponse(res, 400, { error: 'bad_request', message: 'failed to read request body' });
        return;
      }

      // ---- INJECT THINKING POLICY (only for /v1/messages) ----
      if (url === '/v1/messages' && rawBody) {
        try {
          const parsed = JSON.parse(rawBody);
          const policy = resolveThinkingPolicy(config);
          rawBody = JSON.stringify(applyThinkingPolicy(parsed, policy));
        } catch {
          // If JSON parse fails, pass body through as-is — let upstream return the error
        }
      }

      // ---- FORWARD TO UPSTREAM ----
      let upstream;
      try {
        upstream = await forwardAnthropicRequest({
          upstreamBaseUrl: config.upstreamBaseUrl,
          apiKey: config.apiKey,
          path: url,
          method,
          headers: req.headers,
          body: rawBody,
          requestId,
        });

        log.debug('upstream response', {
          requestId,
          status: upstream.status,
          elapsed: Date.now() - start,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('upstream fetch failed', { requestId, error: message });
        jsonResponse(res, 502, {
          error: 'gateway_upstream_error',
          message,
        });
        return;
      }

      // ---- RELAY RESPONSE ----
      try {
        await relayStreamingResponse(upstream, res);
        log.debug('response relayed', {
          requestId,
          elapsed: Date.now() - start,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('streaming relay failed', { requestId, error: message });
        if (!res.headersSent) {
          jsonResponse(res, 502, {
            error: 'streaming_error',
            message,
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('unhandled gateway error', { requestId, error: message });

      if (!res.headersSent) {
        jsonResponse(res, 500, {
          error: 'internal_error',
          message,
        });
      }
    }
  });
}

// Standalone runner
if (process.argv[1] && (process.argv[1].endsWith('/server.js') || process.argv[1].endsWith('/server.ts'))) {
  const config = loadGatewayConfig();
  const server = createServer(config);
  server.listen(config.port, config.host, () => {
    log.info('jeanclaude-gateway listening', { host: config.host, port: config.port });
  });
}
