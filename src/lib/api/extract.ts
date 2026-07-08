import type { ExtractionResult } from '../../types/types';
import { generateJson, parseJsonLoose } from './client';
import { EXTRACTION_MODEL } from './models';

// Vision extraction prompt — verbatim from the build guide spec.
const EXTRACTION_SYSTEM_PROMPT = `You extract job posting data from screenshots. Return ONLY valid JSON, no markdown fences, no preamble.

Schema:
{
  "company": string | null,
  "roleTitle": string | null,
  "jdText": string,            // full posting text, transcribed faithfully
  "salaryBand": string | null, // exactly as written, do not convert currency
  "location": string | null,
  "workMode": "remote" | "hybrid" | "onsite" | "unknown",
  "contactEmail": string | null,
  "contactName": string | null,
  "applyUrl": string | null,   // only if visible in the image
  "skillsRequired": string[],  // specific skills/tools named in the posting
  "experienceRequired": string | null  // e.g. "2-4 years"
}

Rules:
- null for anything not visible. Never guess a company from a logo you are unsure of.
- jdText should be the complete readable text of the posting, cleaned of UI chrome (like/share buttons, "see more" labels).
- skillsRequired: only skills the posting explicitly asks for, not skills merely mentioned in the company description.
- If the image is not a job posting, return {"error": "not_a_job_posting"}.`;

// Same schema, adapted for pasted text (the "smart paste" path in Add job).
const TEXT_EXTRACTION_SYSTEM_PROMPT = `You extract structured job posting data from raw pasted text. Return ONLY valid JSON, no markdown fences, no preamble.

Schema:
{
  "company": string | null,
  "roleTitle": string | null,
  "jdText": string,            // the full posting text, cleaned of nav/boilerplate but otherwise faithful
  "salaryBand": string | null, // exactly as written, do not convert currency
  "location": string | null,
  "workMode": "remote" | "hybrid" | "onsite" | "unknown",
  "contactEmail": string | null,
  "contactName": string | null,
  "applyUrl": string | null,   // only if present in the text
  "skillsRequired": string[],  // specific skills/tools the posting explicitly asks for
  "experienceRequired": string | null  // e.g. "2-4 years"
}

Rules:
- null for anything not present in the text. Do not invent details.
- jdText: the complete posting text, stripped of obvious site chrome (nav links, cookie notices, "apply" button labels) but otherwise unchanged.
- skillsRequired: only skills the posting explicitly requires, not skills merely mentioned in the company description.
- If the text is clearly not a job posting, return {"error": "not_a_job_posting"}.`;

// Image types Gemini vision accepts. Screenshots are ~always png/jpeg/webp.
type SupportedMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/heic';

const SUPPORTED_TYPES: SupportedMediaType[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
];

export class NotAJobPostingError extends Error {
  constructor() {
    super('The image does not look like a job posting.');
    this.name = 'NotAJobPostingError';
  }
}

/** Extraction failed to parse — raw text preserved so nothing is lost. */
export class ExtractionParseError extends Error {
  rawText: string;
  constructor(rawText: string) {
    super('Could not parse the extraction response as JSON.');
    this.name = 'ExtractionParseError';
    this.rawText = rawText;
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function extractFromScreenshot(image: Blob): Promise<ExtractionResult> {
  const mediaType = SUPPORTED_TYPES.includes(image.type as SupportedMediaType)
    ? (image.type as SupportedMediaType)
    : 'image/png';
  const data = await blobToBase64(image);

  const raw = await generateJson({
    model: EXTRACTION_MODEL,
    system: EXTRACTION_SYSTEM_PROMPT,
    parts: [
      { inlineData: { mimeType: mediaType, data } },
      { text: 'Extract the job posting data from this screenshot.' },
    ],
  });

  return interpretResponse(raw);
}

// Smart paste: extract fields from a pasted job posting (text). Same schema and
// review gate as screenshots — nothing lands in the DB without confirmation.
export async function extractFromText(text: string): Promise<ExtractionResult> {
  const raw = await generateJson({
    model: EXTRACTION_MODEL,
    system: TEXT_EXTRACTION_SYSTEM_PROMPT,
    parts: [{ text: `Extract the job posting data from this text:\n\n${text}` }],
  });

  const result = interpretResponse(raw);
  // If the model returned an empty jdText, keep the user's pasted text so
  // nothing is lost.
  if (!result.jdText.trim()) result.jdText = text;
  return result;
}

// Shared: parse the raw JSON defensively and normalize to the ExtractionResult
// shape. A review form always stands between this and the DB, so favor lenient
// coercion over strictness.
function interpretResponse(raw: string): ExtractionResult {
  const parsed = parseJsonLoose<Record<string, unknown>>(raw);
  if (!parsed) {
    throw new ExtractionParseError(raw);
  }
  if (parsed.error === 'not_a_job_posting') {
    throw new NotAJobPostingError();
  }

  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
  const workMode = ['remote', 'hybrid', 'onsite'].includes(parsed.workMode as string)
    ? (parsed.workMode as ExtractionResult['workMode'])
    : 'unknown';

  return {
    company: str(parsed.company),
    roleTitle: str(parsed.roleTitle),
    jdText: typeof parsed.jdText === 'string' ? parsed.jdText : raw,
    salaryBand: str(parsed.salaryBand),
    location: str(parsed.location),
    workMode,
    contactEmail: str(parsed.contactEmail),
    contactName: str(parsed.contactName),
    applyUrl: str(parsed.applyUrl),
    skillsRequired: Array.isArray(parsed.skillsRequired)
      ? parsed.skillsRequired.filter((s): s is string => typeof s === 'string')
      : [],
    experienceRequired: str(parsed.experienceRequired),
  };
}
