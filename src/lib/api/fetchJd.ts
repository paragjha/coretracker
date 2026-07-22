// Client for the /api/fetch-jd serverless function (served by a Vite
// middleware in dev, a Vercel function in production).

export interface FetchedJd {
  text: string;
  sourceUrl: string;
  company?: string;
  roleTitle?: string;
  location?: string;
  salary?: string;
}

export class JdFetchFailed extends Error {}

/** True for a bare URL — used to route a pasted link to the fetcher. */
export function looksLikeUrl(value: string): boolean {
  const t = value.trim();
  if (/\s/.test(t)) return false; // a JD blob, not a link
  return /^https?:\/\/\S+\.\S+/i.test(t);
}

export async function fetchJobDescription(url: string): Promise<FetchedJd> {
  let resp: Response;
  try {
    resp = await fetch(`/api/fetch-jd?url=${encodeURIComponent(url.trim())}`);
  } catch {
    throw new JdFetchFailed('Network error reaching the fetcher.');
  }

  if (!resp.ok) {
    let message = `Could not fetch that link (${resp.status}).`;
    try {
      const body = await resp.json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new JdFetchFailed(message);
  }
  return (await resp.json()) as FetchedJd;
}
