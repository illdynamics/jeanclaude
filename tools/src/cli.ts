import { loadConfig } from './config.js';
import { OpenResponsesClient } from './open-responses-client.js';
import { deterministicEcho } from './deterministic-tool.js';
import { webSearch } from './web-search.js';
import { webFetch } from './web-fetch.js';
import { documentIngest } from './document-ingest.js';
import { documentQuery } from './document-query.js';
import { documentAsk } from './document-ask.js';

function usage() {
  console.error([
    'Usage:',
    '  node cli.js tools-list',
    '  node cli.js smoke',
    '  node cli.js open-responses-ping',
    '  node cli.js web-search "query"',
    '  node cli.js web-fetch <url1> [url2 ...]',
    '  node cli.js document-ingest <path> [collection]',
    '  node cli.js document-query "query" [collection]',
    '  node cli.js document-ask "question" [collection]'
  ].join('\n'));
}

export function listTools() {
  return [
    'deterministic_echo(token)',
    'web_search(query, max_results?, freshness?)',
    'web_fetch(urls, max_bytes?)',
    'document_ingest(path, collection?)',
    'document_query(query, collection?, max_results?)',
    'document_ask(question, collection?)',
    'open_responses_response(input, tools?)'
  ];
}

async function run() {
  const cfg = loadConfig();
  const [cmd, ...args] = process.argv.slice(2);

  try {
    switch (cmd) {
      case 'tools-list': {
        console.log(JSON.stringify({ tools: listTools() }, null, 2));
        return;
      }

      case 'smoke': {
        const out = deterministicEcho('jeanclaude-tool-ok');
        if (out.token !== 'jeanclaude-tool-ok') {
          throw new Error('deterministic_echo failed');
        }
        console.log(JSON.stringify({ ok: true, token: out.token }, null, 2));
        return;
      }

      case 'open-responses-ping': {
        const client = new OpenResponsesClient(cfg);
        const ping = await client.ping();
        console.log(JSON.stringify(ping, null, 2));
        return;
      }

      case 'web-search': {
        if (args.length === 0) throw new Error('web-search requires a query');
        const result = await webSearch(cfg, args.join(' '));
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      case 'web-fetch': {
        if (args.length === 0) throw new Error('web-fetch requires at least one URL');
        const result = await webFetch(cfg, args);
        console.log(JSON.stringify({ results: result }, null, 2));
        return;
      }

      case 'document-ingest': {
        if (args.length === 0) throw new Error('document-ingest requires a path');
        const result = await documentIngest(cfg, args[0], args[1] || 'default');
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      case 'document-query': {
        if (args.length === 0) throw new Error('document-query requires a query');
        const query = args[0];
        const collection = args[1];
        const result = documentQuery(cfg, query, collection, 5);
        console.log(JSON.stringify({ results: result }, null, 2));
        return;
      }

      case 'document-ask': {
        if (args.length === 0) throw new Error('document-ask requires a question');
        const question = args[0];
        const collection = args[1];
        const result = await documentAsk(cfg, question, collection, 5);
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      default:
        usage();
        process.exitCode = 1;
        return;
    }
  } catch (error) {
    console.error(`[tools:error] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

run();
