import { loadConfig } from './config.js';
import { OpenResponsesClient } from './open-responses-client.js';
import { deterministicEcho } from './deterministic-tool.js';
import { webSearch } from './web-search.js';
import { webFetch } from './web-fetch.js';
import { documentIngest } from './document-ingest.js';
import { documentQuery } from './document-query.js';
import { documentAsk } from './document-ask.js';

const config = loadConfig();

function response(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function failure(id, code, message, data) {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, data }
  };
}

function toolText(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
  };
}

const TOOL_DEFS = [
  {
    name: 'jeanclaude_deterministic_echo',
    description: 'Return the exact token for deterministic tool-loop checks.',
    inputSchema: {
      type: 'object',
      properties: { token: { type: 'string' } },
      required: ['token']
    }
  },
  {
    name: 'jeanclaude_web_search',
    description: 'Web search via Open Responses (preferred) with Brave fallback.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        max_results: { type: 'integer' },
        freshness: { type: 'string' }
      },
      required: ['query']
    }
  },
  {
    name: 'jeanclaude_web_fetch',
    description: 'Fetch HTTP/HTTPS URLs with SSRF and content guardrails.',
    inputSchema: {
      type: 'object',
      properties: {
        urls: { type: 'array', items: { type: 'string' } },
        max_bytes: { type: 'integer' }
      },
      required: ['urls']
    }
  },
  {
    name: 'jeanclaude_document_ingest',
    description: 'Ingest a local workspace document into JeanClaude document store.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        collection: { type: 'string' }
      },
      required: ['path']
    }
  },
  {
    name: 'jeanclaude_document_query',
    description: 'Retrieve top snippets from previously ingested documents.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        collection: { type: 'string' },
        max_results: { type: 'integer' }
      },
      required: ['query']
    }
  },
  {
    name: 'jeanclaude_document_ask',
    description: 'Answer a question from retrieved snippets with citations.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        collection: { type: 'string' }
      },
      required: ['question']
    }
  },
  {
    name: 'jeanclaude_open_responses',
    description: 'Raw Open Responses API-backed response call.',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string' },
        tools: { type: 'array' }
      },
      required: ['input']
    }
  },
  // Deprecated unprefixed aliases
  {
    name: 'deterministic_echo',
    description: '[DEPRECATED] Use jeanclaude_deterministic_echo instead.',
    inputSchema: {
      type: 'object',
      properties: { token: { type: 'string' } },
      required: ['token']
    }
  },
  {
    name: 'web_search',
    description: '[DEPRECATED] Use jeanclaude_web_search instead.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        max_results: { type: 'integer' },
        freshness: { type: 'string' }
      },
      required: ['query']
    }
  },
  {
    name: 'web_fetch',
    description: '[DEPRECATED] Use jeanclaude_web_fetch instead.',
    inputSchema: {
      type: 'object',
      properties: {
        urls: { type: 'array', items: { type: 'string' } },
        max_bytes: { type: 'integer' }
      },
      required: ['urls']
    }
  },
  {
    name: 'document_ingest',
    description: '[DEPRECATED] Use jeanclaude_document_ingest instead.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        collection: { type: 'string' }
      },
      required: ['path']
    }
  },
  {
    name: 'document_query',
    description: '[DEPRECATED] Use jeanclaude_document_query instead.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        collection: { type: 'string' },
        max_results: { type: 'integer' }
      },
      required: ['query']
    }
  },
  {
    name: 'document_ask',
    description: '[DEPRECATED] Use jeanclaude_document_ask instead.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        collection: { type: 'string' }
      },
      required: ['question']
    }
  },
  {
    name: 'open_responses_response',
    description: '[DEPRECATED] Use jeanclaude_open_responses instead.',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string' },
        tools: { type: 'array' }
      },
      required: ['input']
    }
  }
];

async function callTool(name, args) {
  // Normalize name: strip jeanclaude_ prefix to resolve handler
  const normalized = name.startsWith('jeanclaude_') ? name.slice('jeanclaude_'.length) : name;

  switch (normalized) {
    case 'deterministic_echo':
      return deterministicEcho(String(args?.token || ''));

    case 'web_search':
      return webSearch(config, String(args?.query || ''), Number(args?.max_results || 5), args?.freshness);

    case 'web_fetch':
      return webFetch(config, args?.urls || [], Number(args?.max_bytes || config.maxFetchBytes));

    case 'document_ingest':
      return documentIngest(config, String(args?.path || ''), String(args?.collection || 'default'));

    case 'document_query':
      return documentQuery(config, String(args?.query || ''), args?.collection, Number(args?.max_results || 5));

    case 'document_ask':
      return documentAsk(config, String(args?.question || ''), args?.collection, Number(args?.max_results || 5));

    case 'open_responses':
    case 'open_responses_response': {
      const client = new OpenResponsesClient(config);
      const raw = await client.createResponse({
        model: config.openResponsesModel,
        input: String(args?.input || ''),
        ...(Array.isArray(args?.tools) ? { tools: args.tools } : {})
      });
      return {
        output_text: OpenResponsesClient.extractText(raw),
        raw
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleRequest(request) {
  const id = Object.prototype.hasOwnProperty.call(request, 'id') ? request.id : null;

  try {
    switch (request.method) {
      case 'initialize':
        return response(id, {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'jeanclaude-tools',
            version: '0.2.3'
          },
          capabilities: {
            tools: {}
          }
        });

      case 'notifications/initialized':
        return null;

      case 'tools/list':
        return response(id, { tools: TOOL_DEFS });

      case 'tools/call': {
        const name = request.params?.name;
        const args = request.params?.arguments || {};
        const result = await callTool(name, args);
        return response(id, toolText(result));
      }

      case 'ping':
        return response(id, { ok: true });

      default:
        return failure(id, -32601, `Method not found: ${request.method}`);
    }
  } catch (error) {
    return failure(id, -32000, error instanceof Error ? error.message : String(error));
  }
}

function writeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8');
  process.stdout.write(header);
  process.stdout.write(body);
}

let buffer = Buffer.alloc(0);

process.stdin.on('data', async (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);

  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd < 0) return;

    const headerText = buffer.slice(0, headerEnd).toString('utf8');
    const lines = headerText.split('\r\n');

    let contentLength = -1;
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      if (key === 'content-length') {
        contentLength = Number(value);
      }
    }

    if (!Number.isFinite(contentLength) || contentLength < 0) {
      buffer = Buffer.alloc(0);
      writeMessage(failure(null, -32700, 'Invalid Content-Length header'));
      return;
    }

    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + contentLength;
    if (buffer.length < messageEnd) return;

    const body = buffer.slice(messageStart, messageEnd).toString('utf8');
    buffer = buffer.slice(messageEnd);

    let request;
    try {
      request = JSON.parse(body);
    } catch {
      writeMessage(failure(null, -32700, 'Parse error'));
      continue;
    }

    const out = await handleRequest(request);
    if (out) writeMessage(out);
  }
});
