// Gemini (free tier) powers vision extraction + match scoring. Two paths:
//  - LOCAL DEV: a client-side key (VITE_GEMINI_API_KEY in .env.local) → the
//    browser calls Gemini directly. Fast, no server needed.
//  - DEPLOYED: no client key in the bundle → the browser POSTs to the
//    same-origin /api/gemini proxy, which holds the key server-side. This is
//    what keeps the key secret on a public deploy.
// The @google/genai SDK is imported dynamically only on the direct path, so the
// deployed (proxy) bundle stays lean — it just uses fetch.
const CLIENT_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any = null;

// AI is available if we have a local key, or we're deployed (proxy present).
export function hasApiKey(): boolean {
  return Boolean(CLIENT_KEY) || import.meta.env.PROD;
}

// A single content part: text, or an inline image (base64).
export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export interface GenerateOptions {
  model: string;
  system: string;
  parts: Part[];
  temperature?: number;
}

// One entry point for both extraction and scoring. Asks Gemini for raw JSON
// (responseMimeType) so the output has no markdown fences to strip.
export async function generateJson(opts: GenerateOptions): Promise<string> {
  if (CLIENT_KEY) {
    // Direct call — local dev only. SDK loaded on demand. thinkingBudget:0
    // disables Gemini 2.5's hidden "thinking" pass to cut latency (ignored by
    // 2.0 models).
    if (!client) {
      const { GoogleGenAI } = await import('@google/genai');
      client = new GoogleGenAI({ apiKey: CLIENT_KEY });
    }
    const res = await client.models.generateContent({
      model: opts.model,
      contents: [{ role: 'user', parts: opts.parts }],
      config: {
        systemInstruction: opts.system,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
        ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      },
    });
    return res.text ?? '';
  }

  // Deployed: route through the same-origin proxy (key stays server-side).
  const resp = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!resp.ok) {
    let message = `Request failed (${resp.status}).`;
    try {
      const body = await resp.json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  const data = (await resp.json()) as { text?: string };
  return data.text ?? '';
}

/** Strips markdown fences and parses JSON; returns null on failure. */
export function parseJsonLoose<T>(raw: string): T | null {
  let text = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/m.exec(text);
  if (fence) text = fence[1];
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
