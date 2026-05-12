import dns from 'node:dns/promises';
import net from 'node:net';

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map((x) => Number(x));
  if (parts.length !== 4 || parts.some((x) => Number.isNaN(x))) return false;
  if (parts[0] === 0) return true;
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
  if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true;
  if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true;
  if (parts[0] >= 224 && parts[0] <= 239) return true;
  if (parts[0] >= 240) return true;
  return false;
}

function isLocalhostName(hostname) {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost');
}

async function assertSafeHost(urlObj, allowLocal) {
  if (allowLocal) return;

  const host = urlObj.hostname;
  if (isLocalhostName(host)) {
    throw new Error(`Local host blocked: ${host}`);
  }

  if (net.isIP(host)) {
    if (net.isIPv4(host) && isPrivateIpv4(host)) {
      throw new Error(`Private/reserved IP blocked: ${host}`);
    }
    if (net.isIPv6(host)) {
      const lower = host.toLowerCase();
      if (host === '::1') throw new Error(`Loopback IPv6 blocked: ${host}`);
      if (host === '::') throw new Error(`Unspecified IPv6 blocked: ${host}`);
      if (lower.match(/^fe[89ab]/)) throw new Error(`Link-local IPv6 blocked: ${host}`);
      if (lower.match(/^f[cd]/)) throw new Error(`Unique-local IPv6 blocked: ${host}`);
      if (lower.startsWith('ff')) throw new Error(`Multicast IPv6 blocked: ${host}`);
      if (lower.startsWith('::ffff:')) throw new Error(`IPv4-mapped IPv6 blocked: ${host}`);
    }
    return;
  }

  const records = await dns.lookup(host, { all: true });
  for (const record of records) {
    if (record.family === 4 && isPrivateIpv4(record.address)) {
      throw new Error(`Private/reserved IP DNS target blocked: ${host} -> ${record.address}`);
    }
    if (record.family === 6) {
      const lower = record.address.toLowerCase();
      if (record.address === '::1' || record.address === '::')
        throw new Error(`Loopback/unspecified IPv6 DNS target blocked: ${host} -> ${record.address}`);
      if (lower.match(/^fe[89ab]/))
        throw new Error(`Link-local IPv6 DNS target blocked: ${host} -> ${record.address}`);
      if (lower.match(/^f[cd]/))
        throw new Error(`Unique-local IPv6 DNS target blocked: ${host} -> ${record.address}`);
      if (lower.startsWith('ff'))
        throw new Error(`Multicast IPv6 DNS target blocked: ${host} -> ${record.address}`);
      if (lower.startsWith('::ffff:'))
        throw new Error(`IPv4-mapped IPv6 DNS target blocked: ${host} -> ${record.address}`);
    }
  }
}

function sanitizeHtmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function webFetch(config, urls, maxBytes = undefined) {
  const limit = Math.max(1024, Number(maxBytes || config.maxFetchBytes || 1000000));
  const out = [];

  for (const candidate of urls || []) {
    const url = String(candidate || '').trim();
    if (!url) continue;

    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
    }

    await assertSafeHost(parsed, config.allowLocalFetch);

    const res = await fetch(parsed, { redirect: 'follow' });
    if (!res.ok) {
      throw new Error(`Fetch failed (${res.status}) for ${url}`);
    }

    const text = await res.text();
    const truncated = text.slice(0, limit);
    const normalized = sanitizeHtmlToText(truncated);

    out.push({
      url,
      retrieved_at: new Date().toISOString(),
      content: `UNTRUSTED WEB CONTENT START\n${normalized}\nUNTRUSTED WEB CONTENT END`
    });
  }

  return out;
}
