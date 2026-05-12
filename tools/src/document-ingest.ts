import fs from 'node:fs';
import path from 'node:path';
import { DocumentStore } from './document-store.js';
import { partitionDocument } from './unstructured-client.js';

const COMPLEX_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.png', '.jpg', '.jpeg', '.gif', '.tiff', '.html', '.htm'
]);

function flattenUnstructuredElements(elements) {
  return elements
    .map((el) => {
      const text = el?.text || el?.metadata?.text_as_html || '';
      return typeof text === 'string' ? text.trim() : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

export async function documentIngest(config, inputPath, collection = 'default') {
  if (config.documents !== 'on') {
    throw new Error('JEANCLAUDE_DOCUMENTS=on is required for document_ingest');
  }

  const abs = DocumentStore.assertAllowedWorkspacePath(inputPath);
  const stat = fs.statSync(abs);
  if (!stat.isFile()) throw new Error(`Not a file: ${abs}`);
  if (stat.size > config.maxIngestBytes) {
    throw new Error(`File too large (${stat.size} bytes > ${config.maxIngestBytes})`);
  }

  const ext = path.extname(abs).toLowerCase();
  let text;
  let metadata = { file_size: stat.size, extension: ext };

  if (COMPLEX_EXTENSIONS.has(ext)) {
    const elements = await partitionDocument(config, abs);
    text = flattenUnstructuredElements(elements);
    metadata = { ...metadata, source: 'unstructured', element_count: elements.length };
  } else {
    text = fs.readFileSync(abs, 'utf8');
    metadata = { ...metadata, source: 'plaintext' };
  }

  const chunks = DocumentStore.splitIntoChunks(text);
  if (chunks.length === 0) {
    throw new Error('No text extracted from document');
  }

  const store = new DocumentStore(config);
  return store.ingest({
    sourcePath: abs,
    collection,
    chunks,
    metadata
  });
}
