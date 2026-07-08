import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// Same-origin proxy for the deployed app. The Gemini key lives ONLY here, as a
// server env var (GEMINI_API_KEY) — never in the browser bundle. The frontend
// POSTs { model, system, parts, temperature }; this forwards to Gemini.
//
// Guardrails so a public portfolio deploy can't drain the key's free quota:
//  - model allowlist (no expensive models)
//  - payload size caps
//  - best-effort per-IP rate limit

const ALLOWED_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
]);
const MAX_TEXT_CHARS = 200_000; // across all text parts
const MAX_IMAGE_CHARS = 7_000_000; // base64 (~5 MB binary)

// In-memory limiter. Ephemeral across cold starts, so not bulletproof — enough
// to deter casual abuse. For hard limits, front it with Upstash/Vercel KV.
const hits = new Map<string, number[]>();
function rateLimited(ip: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > max;
}

let client: GoogleGenAI | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY.' });
  }

  const ip = ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded — please wait a moment.' });
  }

  const { model, system, parts, temperature } = (req.body ?? {}) as {
    model?: string;
    system?: string;
    parts?: unknown;
    temperature?: number;
  };

  if (!model || !ALLOWED_MODELS.has(model)) {
    return res.status(400).json({ error: 'Unsupported model.' });
  }
  if (!Array.isArray(parts) || parts.length === 0) {
    return res.status(400).json({ error: 'Missing content parts.' });
  }

  let textChars = 0;
  let imageChars = 0;
  for (const p of parts as Array<Record<string, unknown>>) {
    if (typeof p.text === 'string') textChars += p.text.length;
    const inline = p.inlineData as { data?: string } | undefined;
    if (inline?.data) imageChars += inline.data.length;
  }
  if (textChars > MAX_TEXT_CHARS || imageChars > MAX_IMAGE_CHARS) {
    return res.status(413).json({ error: 'Payload too large.' });
  }

  try {
    if (!client) client = new GoogleGenAI({ apiKey });
    const result = await client.models.generateContent({
      model,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contents: [{ role: 'user', parts: parts as any }],
      config: {
        systemInstruction: system,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
        ...(typeof temperature === 'number' ? { temperature } : {}),
      },
    });
    return res.status(200).json({ text: result.text ?? '' });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Gemini request failed.';
    return res.status(502).json({ error: message });
  }
}
