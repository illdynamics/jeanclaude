import { OpenResponsesClient } from './open-responses-client.js';

function parseUrls(text) {
  const matches = new Set();
  const re = /https?:\/\/[^\s\]\)\"'<>]+/gi;
  for (const m of text.match(re) || []) matches.add(m);
  return [...matches];
}

function parseJsonResult(text) {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.results)) return parsed.results;
    return null;
  } catch {
    return null;
  }
}

export async function braveSearchFallback(config, query, maxResults = 5, freshness = undefined) {
  if (!config.braveApiKey) {
    throw new Error('BRAVE_API_KEY is required for Brave fallback search');
  }

  const u = new URL('https://api.search.brave.com/res/v1/web/search');
  u.searchParams.set('q', query);
  u.searchParams.set('count', String(maxResults));
  if (freshness) u.searchParams.set('freshness', freshness);

  const res = await fetch(u, {
    headers: {
      'X-Subscription-Token': config.braveApiKey,
      'Accept': 'application/json'
    }
  });

  if (!res.ok) {
    throw new Error(`Brave search failed: HTTP ${res.status}`);
  }

  const body = await res.json();
  const results = [];
  const items = body?.web?.results || [];

  for (const item of items.slice(0, maxResults)) {
    if (!item?.url) continue;
    results.push({
      title: item.title || item.url,
      url: item.url,
      snippet: item.description || '',
      provider: 'brave',
      retrieved_at: new Date().toISOString(),
      query
    });
  }

  return { mode: 'brave-fallback', results };
}

export async function webSearch(config, query, maxResults = 5, freshness = undefined) {
  if (config.webSearch !== 'on') {
    throw new Error('JEANCLAUDE_WEB_SEARCH=on is required for web_search');
  }

  const client = new OpenResponsesClient(config);
  const instructions = [
    `Search the web for: ${query}`,
    `Return compact JSON array with keys: title,url,snippet.`,
    `Limit results to ${maxResults}.`
  ].join(' ');

  const toolCandidates = [
    { type: 'web_search_preview', search_context_size: 'small' },
    { type: 'web_search' }
  ];

  for (const tool of toolCandidates) {
    try {
      const response = await client.createResponse({
        model: config.openResponsesModel,
        input: instructions,
        tools: [tool],
        tool_choice: 'auto'
      });

      const text = OpenResponsesClient.extractText(response);
      const asJson = parseJsonResult(text);
      let results = [];

      if (Array.isArray(asJson)) {
        results = asJson
          .filter((item) => typeof item?.url === 'string' && item.url.startsWith('http'))
          .slice(0, maxResults)
          .map((item) => ({
            title: item.title || item.url,
            url: item.url,
            snippet: item.snippet || '',
            provider: 'open-responses',
            retrieved_at: new Date().toISOString(),
            query
          }));
      }

      if (results.length === 0) {
        const urls = parseUrls(text);
        results = urls.slice(0, maxResults).map((url) => ({
          title: url,
          url,
          snippet: '',
          provider: 'open-responses',
          retrieved_at: new Date().toISOString(),
          query
        }));
      }

      if (results.length > 0) {
        return { mode: 'open-responses', tool: tool.type, results, raw_text: text };
      }
    } catch {
      // Fall through to next tool type or fallback.
    }
  }

  return braveSearchFallback(config, query, maxResults, freshness);
}
