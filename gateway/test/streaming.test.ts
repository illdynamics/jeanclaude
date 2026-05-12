import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadableStream } from 'node:stream/web';
import { relayStreamingResponse } from '../src/streaming.js';

/**
 * Minimal mock of Node's http.ServerResponse that captures writes.
 */
class MockServerResponse {
  constructor() {
    this.statusCode = 0;
    this.headers = {};
    this.chunks = [];
    this.writableEnded = false;
    this.headersSent = false;
  }

  writeHead(statusCode, headers) {
    this.statusCode = statusCode;
    this.headers = headers;
    this.headersSent = true;
  }

  write(chunk) {
    // Uint8Array chunks from ReadableStream; convert to Buffer for comparison
    this.chunks.push(Buffer.from(chunk));
  }

  end() {
    this.writableEnded = true;
  }
}

/**
 * Create a fake upstream Response with an SSE-flavored readable body.
 */
function createSseResponse(sseChunks, status, extraHeaders) {
  status = status || 200;
  extraHeaders = extraHeaders || {};
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of sseChunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/event-stream',
      'x-request-id': 'test-123',
      ...extraHeaders,
    },
  });
}

test('relays SSE chunks in order', async () => {
  const chunks = ['data: chunk1\n\n', 'data: chunk2\n\n', 'data: chunk3\n\n'];
  const upstream = createSseResponse(chunks);
  const downstream = new MockServerResponse();

  await relayStreamingResponse(upstream, downstream);

  // All chunks written in order
  assert.equal(downstream.chunks.length, 3);
  assert.equal(downstream.chunks[0].toString(), 'data: chunk1\n\n');
  assert.equal(downstream.chunks[1].toString(), 'data: chunk2\n\n');
  assert.equal(downstream.chunks[2].toString(), 'data: chunk3\n\n');
  assert.equal(downstream.writableEnded, true);
});

test('preserves status code', async () => {
  const upstream = createSseResponse(['ok\n'], 201);
  const downstream = new MockServerResponse();

  await relayStreamingResponse(upstream, downstream);

  assert.equal(downstream.statusCode, 201);
});

test('preserves Content-Type header', async () => {
  const upstream = createSseResponse(['ok\n']);
  const downstream = new MockServerResponse();

  await relayStreamingResponse(upstream, downstream);

  assert.equal(downstream.headers['content-type'], 'text/event-stream');
});

test('preserves custom headers', async () => {
  const upstream = createSseResponse(['ok\n'], 200, { 'x-custom': 'hello' });
  const downstream = new MockServerResponse();

  await relayStreamingResponse(upstream, downstream);

  assert.equal(downstream.headers['x-custom'], 'hello');
  assert.equal(downstream.headers['x-request-id'], 'test-123');
});

test('skips transfer-encoding header', async () => {
  const upstream = createSseResponse(['ok\n'], 200, {
    'transfer-encoding': 'chunked',
  });
  const downstream = new MockServerResponse();

  await relayStreamingResponse(upstream, downstream);

  assert.equal('transfer-encoding' in downstream.headers, false);
});

test('handles empty upstream body', async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
  const upstream = new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  });
  const downstream = new MockServerResponse();

  await relayStreamingResponse(upstream, downstream);

  assert.equal(downstream.statusCode, 200);
  assert.equal(downstream.chunks.length, 0);
  assert.equal(downstream.writableEnded, true);
});

test('relays large number of chunks', async () => {
  const count = 100;
  const chunks = Array.from({ length: count }, (_, i) => `data: chunk${i}\n\n`);
  const upstream = createSseResponse(chunks);
  const downstream = new MockServerResponse();

  await relayStreamingResponse(upstream, downstream);

  assert.equal(downstream.chunks.length, count);
  for (let i = 0; i < count; i++) {
    assert.equal(downstream.chunks[i].toString(), `data: chunk${i}\n\n`);
  }
  assert.equal(downstream.writableEnded, true);
});
