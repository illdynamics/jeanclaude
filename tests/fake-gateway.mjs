#!/usr/bin/env node

/**
 * fake-gateway.mjs — A fake HTTP gateway server for testing JeanClaude gateway mode.
 *
 * Endpoints:
 *   GET  /healthz               → {"ok":true,"version":"0.1.0","mode":"gateway"}
 *   POST /v1/messages           → {"fake":"gateway","received":{"model":"..."}}
 *   POST /v1/messages/count_tokens → {"input_tokens":10}
 *
 * Behaviour:
 *  - Listens on a free port on 127.0.0.1
 *  - Prints the port number to stdout so tests can parse it
 *  - Supports FAKE_GATEWAY_EXIT_CODE for testing error paths
 *  - Supports FAKE_GATEWAY_REQUIRE_AUTH=1 for auth checking
 *  - FAKE_GATEWAY_VALID_TOKEN overrides the accepted bearer token (default: jeanclaude-gateway)
 *
 * Usage:
 *   node tests/fake-gateway.mjs
 *   # reads FAKE_GATEWAY_EXIT_CODE (default 0)
 *   # reads FAKE_GATEWAY_REQUIRE_AUTH (default 0)
 *   # reads FAKE_GATEWAY_VALID_TOKEN (default jeanclaude-gateway)
 */

import http from 'node:http';

const EXIT_CODE = Number.parseInt(process.env.FAKE_GATEWAY_EXIT_CODE ?? '0', 10);
const REQUIRE_AUTH = process.env.FAKE_GATEWAY_REQUIRE_AUTH === '1';
const VALID_TOKEN = process.env.FAKE_GATEWAY_VALID_TOKEN ?? 'jeanclaude-gateway';

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function checkAuth(req, res) {
  if (!REQUIRE_AUTH) return true;

  const authHeader = req.headers['authorization'] ?? '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (match && match[1] === VALID_TOKEN) return true;

  res.writeHead(401, {
    'content-type': 'application/json',
    'www-authenticate': 'Bearer',
  });
  res.end(JSON.stringify({ error: 'unauthorized', message: 'Valid bearer token required' }));
  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = req.url || '/';

    if (url === '/healthz' && req.method === 'GET') {
      // Health endpoint does not require auth even when REQUIRE_AUTH is set
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, version: '0.1.0', mode: 'gateway' }));
      return;
    }

    // Auth check for all non-health endpoints
    if (!checkAuth(req, res)) return;

    if (url === '/v1/messages' && req.method === 'POST') {
      let body = '';
      try { body = await readBody(req); } catch { /* empty body ok */ }

      let model = 'unknown';
      try {
        const parsed = JSON.parse(body);
        model = parsed.model || 'unknown';
      } catch { /* non-JSON body */ }

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ fake: 'gateway', received: { model } }));
      return;
    }

    if (url === '/v1/messages/count_tokens' && req.method === 'POST') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ input_tokens: 10 }));
      return;
    }

    // Unknown endpoint
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  } catch {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
});

server.listen(0, '127.0.0.1', () => {
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    console.error('Could not determine port');
    process.exit(1);
  }
  // Print port on stdout for test parsing
  console.log(String(addr.port));

  // If FAKE_GATEWAY_EXIT_CODE is non-zero, exit after announcing port
  // (tests expecting error paths won't actually connect)
  if (EXIT_CODE !== 0) {
    server.close();
    process.exit(EXIT_CODE);
  }
});

// Handle graceful shutdown
function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
