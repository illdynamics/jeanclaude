import { OpenResponsesClient } from './open-responses-client.js';
import { documentQuery } from './document-query.js';

export async function documentAsk(config, question, collection = undefined, maxResults = 5) {
  const hits = documentQuery(config, question, collection, maxResults);
  if (hits.length === 0) {
    throw new Error('No relevant document chunks found. Refusing answer without retrieved evidence.');
  }

  const context = hits.map((hit) => (
    `Snippet ${hit.chunk_id} (score=${hit.score}, source=${hit.source_path}):\n${hit.snippet}`
  )).join('\n\n');

  const input = [
    'Answer the question using only the snippets below.',
    'Always cite snippet ids used in your answer.',
    `Question: ${question}`,
    '',
    context
  ].join('\n');

  const client = new OpenResponsesClient(config);
  const response = await client.createResponse({
    model: config.openResponsesModel,
    input
  });

  const answer = OpenResponsesClient.extractText(response);
  return {
    answer,
    citations: hits.map((h) => h.chunk_id),
    snippets: hits
  };
}
