import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DocumentStore } from '../src/document-store.js';

test('document store ingest/query roundtrip', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jeanclaude-docstore-'));
  const store = new DocumentStore({ documentStore: root });

  const ingested = store.ingest({
    sourcePath: '/workspace/docs/spec.txt',
    collection: 'specs',
    chunks: ['DeepSeek integration uses anthropic endpoint.', 'Open Responses handles tools.'],
    metadata: { source: 'test' }
  });

  assert.equal(ingested.chunk_count, 2);
  const hits = store.query({ query: 'anthropic endpoint', collection: 'specs', maxResults: 3 });
  assert.ok(hits.length >= 1);
});
