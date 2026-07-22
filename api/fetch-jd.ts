import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchJobDescription, JdFetchError } from './_jdFetcher';

// Same-origin proxy for fetching a job posting by URL. The browser can't do
// this itself (CORS + LinkedIn's auth wall), so the fetch happens here.
// SSRF guards live in _jdFetcher.assertSafeUrl.

const hits = new Map<string, number[]>();
function rateLimited(ip: string, max = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > max;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many link fetches — wait a moment.' });
  }

  const url =
    req.method === 'GET'
      ? (req.query.url as string | undefined)
      : ((req.body ?? {}) as { url?: string }).url;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url.' });
  }

  try {
    const result = await fetchJobDescription(url);
    return res.status(200).json(result);
  } catch (e) {
    if (e instanceof JdFetchError) {
      return res.status(e.status).json({ error: e.message });
    }
    return res.status(500).json({ error: 'Could not fetch that link.' });
  }
}
