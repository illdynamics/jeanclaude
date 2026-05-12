import { getLogger } from './logging.js';

const log = getLogger();

/**
 * Relay an upstream fetch Response to the downstream Node.js ServerResponse.
 * Handles both streaming (SSE/chunked) and non-streaming responses.
 */
export async function relayStreamingResponse(upstreamResponse, downstreamResponse) {
  const headers = {};

  // Copy headers, handling multi-value headers
  upstreamResponse.headers.forEach((value, key) => {
    // Skip transfer-encoding — Node handles this itself
    if (key.toLowerCase() === 'transfer-encoding') return;
    // If already set, append with comma
    if (headers[key]) {
      headers[key] = `${headers[key]}, ${value}`;
    } else {
      headers[key] = value;
    }
  });

  downstreamResponse.writeHead(upstreamResponse.status, headers);

  const body = upstreamResponse.body;

  if (!body) {
    log.debug('upstream response had no body', { status: upstreamResponse.status });
    downstreamResponse.end();
    return;
  }

  try {
    let byteCount = 0;
    for await (const chunk of body) {
      downstreamResponse.write(chunk);
      byteCount += chunk.length;
    }
    log.debug('streaming relay complete', { bytes: byteCount });
  } catch (err) {
    log.warn('streaming relay interrupted', {
      error: err instanceof Error ? err.message : String(err),
    });
    if (!downstreamResponse.writableEnded) {
      downstreamResponse.end();
    }
    return;
  }

  if (!downstreamResponse.writableEnded) {
    downstreamResponse.end();
  }
}
