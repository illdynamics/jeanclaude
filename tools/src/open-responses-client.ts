import { loadConfig } from './config.js';
import { redactObject } from './redact.js';

function joinUrl(base, pathname) {
  return `${base.replace(/\/$/, '')}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function maybeLogDebug(config, label, payload) {
  if (!config.debugBody) return;
  const redacted = redactObject(payload);
  process.stderr.write(`[tools:debug] ${label}: ${JSON.stringify(redacted)}\n`);
}

export class OpenResponsesClient {
  constructor(config = loadConfig()) {
    this.config = config;
  }

  async #request(pathname, method = 'GET', body = undefined, mode = 'bearer') {
    const url = joinUrl(this.config.openResponsesUrl, pathname);
    const headers = { 'content-type': 'application/json' };

    if (this.config.responseApiKey) {
      headers.authorization = mode === 'bearer'
        ? `Bearer ${this.config.responseApiKey}`
        : this.config.responseApiKey;
    }

    maybeLogDebug(this.config, 'open-responses.request', { url, method, headers, body });

    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const raw = await res.text();
    let json = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }

    maybeLogDebug(this.config, 'open-responses.response', {
      url,
      status: res.status,
      statusText: res.statusText,
      body: json || raw
    });

    return {
      status: res.status,
      ok: res.ok,
      json,
      text: raw
    };
  }

  async status() {
    const response = await this.#request('/v1/responses', 'GET');
    return response.status;
  }

  static extractText(responseJson) {
    if (!responseJson || typeof responseJson !== 'object') return '';
    const texts = [];

    if (typeof responseJson.output_text === 'string') {
      texts.push(responseJson.output_text);
    }

    const output = Array.isArray(responseJson.output) ? responseJson.output : [];
    for (const item of output) {
      const content = Array.isArray(item?.content) ? item.content : [];
      for (const block of content) {
        if (typeof block?.text === 'string') texts.push(block.text);
      }
    }

    return texts.filter(Boolean).join('\n').trim();
  }

  async createResponse(payload) {
    let response = await this.#request('/v1/responses', 'POST', payload, 'bearer');

    if ((response.status === 401 || response.status === 403) && this.config.responseApiKey) {
      response = await this.#request('/v1/responses', 'POST', payload, 'raw');
    }

    if (!response.ok) {
      const details = response.json || response.text || `HTTP ${response.status}`;
      throw new Error(`Open Responses request failed (${response.status}): ${typeof details === 'string' ? details : JSON.stringify(details)}`);
    }

    return response.json || {};
  }

  async ping() {
    const token = 'jeanclaude-open-responses-ok';
    const json = await this.createResponse({
      model: this.config.openResponsesModel,
      input: `Return exactly: ${token}`
    });

    const text = OpenResponsesClient.extractText(json);
    if (!text.includes(token)) {
      throw new Error(`Open Responses ping token not found in response: ${text || '<empty>'}`);
    }

    return { token, text, raw: json };
  }
}
