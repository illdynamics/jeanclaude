import { getLogger } from './logging.js';

const log = getLogger();

export async function forwardAnthropicRequest({
  upstreamBaseUrl,
  apiKey,
  path,
  method,
  headers,
  body,
  requestId,
}) {
  const url = `${upstreamBaseUrl.replace(/\/$/, '')}${path}`;

  const forwarded = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'x-request-id': requestId,
    'anthropic-version': headers['anthropic-version'] || '2023-06-01',
  };

  if (headers['anthropic-beta']) {
    forwarded['anthropic-beta'] = headers['anthropic-beta'];
  }

  log.debug('forwarding to upstream', {
    requestId,
    url,
    method,
    bodyLength: body.length,
  });

  return fetch(url, {
    method,
    headers: forwarded,
    body: body || undefined,
  });
}
