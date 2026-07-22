// Server-side job-description fetcher, shared by the Vercel function
// (api/fetch-jd.ts) and the Vite dev middleware so local dev behaves the same.
// Files under api/ starting with "_" are not deployed as their own function.
//
// This exists because the browser can't fetch job boards cross-origin (CORS,
// and LinkedIn requires auth for the normal job page). Fetching server-side
// with a browser User-Agent — and, for LinkedIn, hitting the public guest
// endpoint — gets the full posting without a login.

export interface FetchedJd {
  /** Cleaned posting text, ready to hand to the existing paste-and-sort extractor. */
  text: string;
  sourceUrl: string;
  /** Structured hints from JSON-LD when the board publishes them. */
  company?: string;
  roleTitle?: string;
  location?: string;
  salary?: string;
}

export class JdFetchError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'JdFetchError';
    this.status = status;
  }
}

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 5_000_000;
const MAX_TEXT_CHARS = 120_000;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// --- SSRF guard -------------------------------------------------------------
// This endpoint fetches a user-supplied URL from our server, so it must not be
// usable to probe private networks or the cloud metadata service.
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^metadata\./i,
];

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) || // link-local incl. 169.254.169.254 metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new JdFetchError('That does not look like a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new JdFetchError('Only http and https links are supported.');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    BLOCKED_HOST_PATTERNS.some((re) => re.test(host)) ||
    isPrivateIpv4(host) ||
    host === '::1' ||
    host.startsWith('fe80:') ||
    host.startsWith('fc') ||
    host.startsWith('fd')
  ) {
    throw new JdFetchError('That host is not allowed.');
  }
  return url;
}

// --- HTML helpers -----------------------------------------------------------

// The HTML4 Latin-1 entity names, in codepoint order from U+00A0 — so
// LATIN1[i] maps to charCode 160 + i. Covers the accented characters that show
// up constantly in company names and locations (Café, Zürich, Peña…).
const LATIN1 =
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'.split(
    ' ',
  );

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  bull: '•',
  trade: '™',
  euro: '€',
};
// nbsp becomes a plain space so whitespace collapsing works normally.
LATIN1.forEach((name, i) => {
  ENTITIES[name] = name === 'nbsp' ? ' ' : String.fromCharCode(160 + i);
});

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    // Entity names are case-sensitive (&Eacute; ≠ &eacute;), so try the exact
    // name first and only then a lowercase fallback.
    .replace(/&([a-z0-9]+);/gi, (m, name: string) => ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? m);
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Site chrome that survives tag-stripping and would otherwise pollute the JD.
const BOILERPLATE = [
  /^sign in$/i,
  /^join now$/i,
  /^skip to main content$/i,
  /^cookie policy$/i,
  /^privacy policy$/i,
  /^terms of service$/i,
  /^see more$/i,
  /^see less$/i,
  /^show more$/i,
  /^show less$/i,
  /^apply$/i,
  /^save$/i,
  /^report this job$/i,
  /^\s*$/,
];

export function stripBoilerplate(text: string): string {
  const lines = text.split('\n').filter((line) => {
    const t = line.trim();
    return !BOILERPLATE.some((re) => re.test(t));
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// --- JSON-LD ----------------------------------------------------------------
// Most ATS boards (Greenhouse, Lever, Workday, and LinkedIn itself) embed a
// schema.org JobPosting. When present it's far cleaner than scraped markup.

interface JsonLdJob {
  title?: string;
  company?: string;
  location?: string;
  salary?: string;
  description?: string;
}

function asText(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim();
  return undefined;
}

function readJobPosting(node: Record<string, unknown>): JsonLdJob | null {
  const type = node['@type'];
  const types = Array.isArray(type) ? type : [type];
  if (!types.some((t) => typeof t === 'string' && t.toLowerCase() === 'jobposting')) return null;

  const org = node.hiringOrganization as Record<string, unknown> | undefined;
  const loc = node.jobLocation as Record<string, unknown> | Record<string, unknown>[] | undefined;
  const firstLoc = Array.isArray(loc) ? loc[0] : loc;
  const address = firstLoc?.address as Record<string, unknown> | undefined;
  const salaryNode = node.baseSalary as Record<string, unknown> | undefined;
  const salaryValue = salaryNode?.value as Record<string, unknown> | undefined;

  const locationParts = [
    asText(address?.addressLocality),
    asText(address?.addressRegion),
    asText(address?.addressCountry),
  ].filter(Boolean);

  let salary: string | undefined;
  if (salaryValue) {
    const min = asText(String(salaryValue.minValue ?? '')) ?? '';
    const max = asText(String(salaryValue.maxValue ?? '')) ?? '';
    const unit = asText(salaryValue.unitText as string);
    const currency = asText(salaryNode?.currency as string) ?? '';
    const range = [min, max].filter(Boolean).join('-');
    if (range) salary = `${currency} ${range}${unit ? ` per ${unit.toLowerCase()}` : ''}`.trim();
  }

  return {
    title: asText(node.title),
    company: asText(org?.name),
    location: locationParts.length ? locationParts.join(', ') : asText(firstLoc?.name as string),
    salary,
    description: asText(node.description),
  };
}

export function extractJsonLdJob(html: string): JsonLdJob | null {
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1].trim());
    } catch {
      continue;
    }
    // A page may ship an array, or a @graph wrapper, or a bare object.
    const candidates: unknown[] = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null && '@graph' in parsed
        ? ((parsed as Record<string, unknown>)['@graph'] as unknown[])
        : [parsed];
    for (const c of candidates ?? []) {
      if (typeof c === 'object' && c !== null) {
        const job = readJobPosting(c as Record<string, unknown>);
        if (job) return job;
      }
    }
  }
  return null;
}

// --- LinkedIn ---------------------------------------------------------------

/** LinkedIn job ids are long numerics, in the path or the currentJobId param. */
export function linkedInJobId(url: URL): string | null {
  if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
  const fromQuery = url.searchParams.get('currentJobId');
  if (fromQuery && /^\d{6,}$/.test(fromQuery)) return fromQuery;
  const match = url.pathname.match(/(\d{6,})/);
  return match ? match[1] : null;
}

async function get(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': BROWSER_UA,
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new JdFetchError(
        res.status === 404
          ? 'That posting could not be found (it may have been taken down).'
          : `The site returned ${res.status}.`,
        502,
      );
    }
    const length = Number(res.headers.get('content-length') ?? 0);
    if (length > MAX_BYTES) throw new JdFetchError('That page is too large to fetch.', 413);
    const body = await res.text();
    return body.slice(0, MAX_BYTES);
  } catch (e) {
    if (e instanceof JdFetchError) throw e;
    if (e instanceof Error && e.name === 'AbortError') {
      throw new JdFetchError('The site took too long to respond.', 504);
    }
    throw new JdFetchError('Could not reach that site.', 502);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJobDescription(rawUrl: string): Promise<FetchedJd> {
  const url = assertSafeUrl(rawUrl);

  // LinkedIn's normal job page is behind an auth wall; the guest endpoint
  // returns the full posting markup without a login.
  const jobId = linkedInJobId(url);
  if (jobId) {
    const html = await get(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`);
    const structured = extractJsonLdJob(html);
    const text = stripBoilerplate(htmlToText(html)).slice(0, MAX_TEXT_CHARS);
    if (text.length < 40 && !structured?.description) {
      throw new JdFetchError('That LinkedIn posting returned no readable text.', 502);
    }
    return {
      text: buildText(structured, text),
      sourceUrl: url.toString(),
      company: structured?.company,
      roleTitle: structured?.title,
      location: structured?.location,
      salary: structured?.salary,
    };
  }

  const html = await get(url.toString());
  const structured = extractJsonLdJob(html);
  const pageText = stripBoilerplate(htmlToText(html)).slice(0, MAX_TEXT_CHARS);

  if (!structured && pageText.length < 40) {
    throw new JdFetchError('No readable job text found at that link.', 422);
  }

  return {
    text: buildText(structured, pageText),
    sourceUrl: url.toString(),
    company: structured?.company,
    roleTitle: structured?.title,
    location: structured?.location,
    salary: structured?.salary,
  };
}

/**
 * Puts any structured fields up front as a short header. The downstream LLM
 * extractor reads these far more reliably than it re-derives them from prose.
 */
function buildText(structured: JsonLdJob | null, pageText: string): string {
  const header: string[] = [];
  if (structured?.title) header.push(`Role: ${structured.title}`);
  if (structured?.company) header.push(`Company: ${structured.company}`);
  if (structured?.location) header.push(`Location: ${structured.location}`);
  if (structured?.salary) header.push(`Salary: ${structured.salary}`);

  const description = structured?.description
    ? stripBoilerplate(htmlToText(structured.description))
    : '';
  // Prefer the structured description; fall back to scraped page text.
  const body = description.length > pageText.length / 2 ? description : pageText;

  return [header.join('\n'), body].filter(Boolean).join('\n\n').slice(0, MAX_TEXT_CHARS);
}
