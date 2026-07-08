import type { Job, Resume, ScoreBreakdown } from '../../types/types';
import { db } from '../db/db';
import { generateJson, parseJsonLoose } from './client';
import { SCORING_MODEL } from './models';

// Match-scoring prompt — verbatim from the build guide spec.
const SCORING_SYSTEM_PROMPT = `You are scoring how well a candidate's resume matches a job description. Return ONLY valid JSON.

Schema:
{
  "matchScore": number,        // 0-100
  "matchedSkills": string[],   // required skills clearly evidenced in the resume
  "missingSkills": string[],   // required skills with no evidence in the resume
  "experienceFit": "under" | "match" | "over",
  "verdict": string            // max 2 sentences: should they prioritize this, and the single biggest gap or strength
}

Scoring rubric:
- 40% skills overlap (required skills evidenced in resume)
- 25% experience level fit
- 20% role-type fit (is the resume's trajectory pointed at this kind of role)
- 15% domain fit (industry, market, product type)

Rules:
- Evidence means the resume shows the skill in use, not just lists a keyword.
- Be strict. A resume that lists "Figma" once does not fully match "advanced prototyping in Figma."
- Do not inflate. 85+ should be rare and mean "apply today."`;

interface ScoringResponse extends ScoreBreakdown {
  matchScore: number;
}

export class ScoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScoringError';
  }
}

/** Scores a job against the resume and persists the result on the job row. */
export async function scoreJob(job: Job, resume: Resume): Promise<ScoringResponse> {
  // Resume and JD as clearly delimited blocks, per the guide. Low temperature
  // for score stability.
  const userMessage = [
    '<resume>',
    resume.content,
    '</resume>',
    '',
    '<job_description>',
    job.jdText,
    '</job_description>',
    '',
    `<skills_required>${job.skillsRequired.join(', ') || 'not specified'}</skills_required>`,
    `<experience_required>${job.experienceRequired ?? 'not specified'}</experience_required>`,
  ].join('\n');

  // Low temperature for score stability across repeated runs.
  const raw = await generateJson({
    model: SCORING_MODEL,
    system: SCORING_SYSTEM_PROMPT,
    parts: [{ text: userMessage }],
    temperature: 0.2,
  });

  const parsed = parseJsonLoose<Partial<ScoringResponse>>(raw);
  if (!parsed || typeof parsed.matchScore !== 'number') {
    throw new ScoringError('Could not parse the scoring response.');
  }

  const result: ScoringResponse = {
    matchScore: Math.max(0, Math.min(100, Math.round(parsed.matchScore))),
    matchedSkills: Array.isArray(parsed.matchedSkills)
      ? parsed.matchedSkills.filter((s): s is string => typeof s === 'string')
      : [],
    missingSkills: Array.isArray(parsed.missingSkills)
      ? parsed.missingSkills.filter((s): s is string => typeof s === 'string')
      : [],
    experienceFit: ['under', 'match', 'over'].includes(parsed.experienceFit as string)
      ? (parsed.experienceFit as ScoreBreakdown['experienceFit'])
      : 'match',
    verdict: typeof parsed.verdict === 'string' ? parsed.verdict : '',
  };

  await db.jobs.update(job.id, {
    matchScore: result.matchScore,
    scoreBreakdown: {
      matchedSkills: result.matchedSkills,
      missingSkills: result.missingSkills,
      experienceFit: result.experienceFit,
      verdict: result.verdict,
    },
    scoredAgainstResumeVersion: resume.version,
  });

  return result;
}
