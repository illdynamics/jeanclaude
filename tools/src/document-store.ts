import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const BLOCKED_FILES = [
  /^\.env$/i,
  /^\.env\..+/i,
  /\.pem$/i,
  /\.key$/i,
  /^id_rsa$/i,
  /^id_ed25519$/i
];

const BLOCKED_PATHS = [
  /(^|\/)secrets(\/|$)/i,
  /(^|\/)\.git(\/|$)/,
  /(^|\/)node_modules(\/|$)/
];

function safeJoin(root, child) {
  const resolved = path.resolve(root, child);
  const normalizedRoot = path.resolve(root) + path.sep;
  if (!resolved.startsWith(normalizedRoot)) {
    throw new Error(`Path escapes store root: ${child}`);
  }
  return resolved;
}

function tokenize(text) {
  return String(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function scoreChunk(queryTokens, chunkText) {
  const corpus = new Set(tokenize(chunkText));
  let score = 0;
  for (const token of queryTokens) {
    if (corpus.has(token)) score += 1;
  }
  return score;
}

function resolveWorkspaceRoot() {
  return process.env.JEANCLAUDE_WORKSPACE_ROOT || process.cwd();
}

export class DocumentStore {
  constructor(config) {
    this.config = config;
    this.root = path.resolve(config.documentStore);
    this.indexPath = path.join(this.root, 'index.json');
    fs.mkdirSync(this.root, { recursive: true });
  }

  #loadIndex() {
    if (!fs.existsSync(this.indexPath)) {
      return { documents: [] };
    }
    return JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
  }

  #saveIndex(index) {
    fs.writeFileSync(this.indexPath, JSON.stringify(index, null, 2));
  }

  static assertAllowedWorkspacePath(candidatePath, workspaceRoot) {
    const root = workspaceRoot || resolveWorkspaceRoot();

    // Reject paths with parent directory traversal
    if (candidatePath.includes('..')) {
      throw new Error(`Path traversal blocked: ${candidatePath}`);
    }

    const abs = path.resolve(candidatePath);
    const base = path.resolve(root) + path.sep;
    if (!abs.startsWith(base)) {
      throw new Error(`Path outside workspace is blocked: ${candidatePath}`);
    }

    const baseName = path.basename(abs);
    for (const pattern of BLOCKED_FILES) {
      if (pattern.test(baseName)) {
        throw new Error(`Blocked file type: ${baseName}`);
      }
    }

    for (const pattern of BLOCKED_PATHS) {
      if (pattern.test(abs)) {
        throw new Error(`Blocked path: ${abs}`);
      }
    }

    return abs;
  }

  static splitIntoChunks(text, chunkSize = 1200) {
    const value = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!value) return [];
    const chunks = [];
    for (let i = 0; i < value.length; i += chunkSize) {
      chunks.push(value.slice(i, i + chunkSize));
    }
    return chunks;
  }

  ingest({ sourcePath, collection = 'default', chunks, metadata = {} }) {
    const index = this.#loadIndex();
    const docId = crypto.randomUUID();

    const normalizedChunks = chunks.map((chunk, idx) => ({
      id: `${docId}:chunk:${idx + 1}`,
      text: String(chunk),
      index: idx + 1
    }));

    const docRecord = {
      id: docId,
      collection,
      sourcePath,
      metadata,
      createdAt: new Date().toISOString(),
      chunkCount: normalizedChunks.length,
      chunks: normalizedChunks
    };

    const docPath = safeJoin(this.root, `${docId}.json`);
    fs.writeFileSync(docPath, JSON.stringify(docRecord, null, 2));

    index.documents = index.documents.filter((d) => d.id !== docId);
    index.documents.push({
      id: docId,
      collection,
      sourcePath,
      chunkCount: normalizedChunks.length,
      createdAt: docRecord.createdAt
    });
    this.#saveIndex(index);

    return {
      document_id: docId,
      chunk_count: normalizedChunks.length,
      collection,
      metadata,
      stored_at: docPath
    };
  }

  #iterDocuments(collection) {
    const index = this.#loadIndex();
    const docs = [];
    for (const summary of index.documents || []) {
      if (collection && summary.collection !== collection) continue;
      const docPath = safeJoin(this.root, `${summary.id}.json`);
      if (!fs.existsSync(docPath)) continue;
      docs.push(JSON.parse(fs.readFileSync(docPath, 'utf8')));
    }
    return docs;
  }

  query({ query, collection, maxResults = 5 }) {
    const docs = this.#iterDocuments(collection);
    const queryTokens = tokenize(query);
    const scored = [];

    for (const doc of docs) {
      for (const chunk of doc.chunks || []) {
        const score = scoreChunk(queryTokens, chunk.text);
        if (score <= 0) continue;
        scored.push({
          document_id: doc.id,
          source_path: doc.sourcePath,
          collection: doc.collection,
          chunk_id: chunk.id,
          chunk_index: chunk.index,
          snippet: chunk.text,
          score,
          metadata: doc.metadata || {}
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults);
  }
}
