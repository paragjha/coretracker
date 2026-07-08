import { db } from './db/db';
import { makeJob } from './jobs';
import { saveResume } from './resume';
import type { JobStatus } from '../types/types';

// Demo content so a fresh visitor (recruiter, friend) sees the app alive rather
// than empty. Lives in their own browser like any other data.

const SAMPLE_RESUME = `# Alex Rivera
**Product Designer** · Bengaluru · alex.rivera@example.com

## Summary
Product designer with 5 years shipping 0-to-1 consumer and B2B products.
Led a design-system rebuild at a fintech scale-up; comfortable owning research
through high-fidelity prototyping.

## Skills
- Figma (advanced prototyping, variables, auto-layout)
- Design systems
- User research & usability testing
- Interaction & motion design

## Experience
**Senior Product Designer — Paycrest (2022–now)**
Rebuilt the design system adopted across 6 squads; shipped a redesigned
onboarding that lifted activation 18%.

**Product Designer — Meridian (2019–2022)**
Owned end-to-end design for two 0-to-1 products.`;

interface Seed {
  company: string;
  roleTitle: string;
  status: JobStatus;
  location?: string;
  salaryBand?: string;
  workMode?: 'remote' | 'hybrid' | 'onsite';
  skillsRequired: string[];
  experienceRequired?: string;
  addedDaysAgo: number;
  appliedDaysAgo?: number;
  matchScore?: number;
  breakdown?: {
    matchedSkills: string[];
    missingSkills: string[];
    experienceFit: 'under' | 'match' | 'over';
    verdict: string;
  };
}

const SEEDS: Seed[] = [
  {
    company: 'Nimbus Labs',
    roleTitle: 'Senior Product Designer',
    status: 'to_apply',
    location: 'Bengaluru',
    workMode: 'hybrid',
    salaryBand: '28-36 LPA',
    experienceRequired: '5-8 years',
    skillsRequired: ['Figma', 'design systems', 'prototyping', 'motion design'],
    addedDaysAgo: 1,
    matchScore: 88,
    breakdown: {
      matchedSkills: ['Figma', 'design systems', 'prototyping'],
      missingSkills: ['motion design'],
      experienceFit: 'match',
      verdict: 'Strong fit — apply soon. Emphasize the design-system rebuild; add any motion work.',
    },
  },
  {
    company: 'Cobalt',
    roleTitle: 'UX Researcher',
    status: 'to_apply',
    location: 'Remote',
    workMode: 'remote',
    experienceRequired: '3-5 years',
    skillsRequired: ['user research', 'usability testing', 'survey design'],
    addedDaysAgo: 2,
    matchScore: 63,
    breakdown: {
      matchedSkills: ['user research', 'usability testing'],
      missingSkills: ['survey design at scale'],
      experienceFit: 'match',
      verdict: 'Moderate fit. Research is evidenced but this leans pure-research vs. your product focus.',
    },
  },
  {
    company: 'Harbor Financial',
    roleTitle: 'Design Lead',
    status: 'applied',
    location: 'Mumbai',
    workMode: 'onsite',
    salaryBand: '40-52 LPA',
    experienceRequired: '8+ years',
    skillsRequired: ['team leadership', 'design systems', 'stakeholder management'],
    addedDaysAgo: 21,
    appliedDaysAgo: 18,
    matchScore: 54,
    breakdown: {
      matchedSkills: ['design systems'],
      missingSkills: ['formal team leadership', 'people management'],
      experienceFit: 'under',
      verdict: 'A reach — the role wants a manager. Frame your squad-wide system work as leadership.',
    },
  },
  {
    company: 'Vertex Studio',
    roleTitle: 'Staff Product Designer',
    status: 'interviewing',
    location: 'Remote',
    workMode: 'remote',
    salaryBand: '45-60 LPA',
    experienceRequired: '7+ years',
    skillsRequired: ['product strategy', 'Figma', 'design systems'],
    addedDaysAgo: 12,
    appliedDaysAgo: 10,
    matchScore: 79,
    breakdown: {
      matchedSkills: ['Figma', 'design systems', 'product strategy'],
      missingSkills: [],
      experienceFit: 'match',
      verdict: 'Great fit and already in process — prioritize prep here.',
    },
  },
  {
    company: 'Meridian Health',
    roleTitle: 'Design Systems Engineer',
    status: 'offer',
    location: 'Bengaluru',
    workMode: 'hybrid',
    salaryBand: '32-40 LPA',
    experienceRequired: '4-6 years',
    skillsRequired: ['design systems', 'Figma', 'front-end handoff'],
    addedDaysAgo: 30,
    appliedDaysAgo: 26,
    matchScore: 84,
    breakdown: {
      matchedSkills: ['design systems', 'Figma'],
      missingSkills: ['production front-end code'],
      experienceFit: 'match',
      verdict: 'Excellent fit — you have an offer. Your systems background is exactly the ask.',
    },
  },
  {
    company: 'Lumen',
    roleTitle: 'Brand Designer',
    status: 'rejected',
    location: 'Remote',
    workMode: 'remote',
    skillsRequired: ['brand identity', 'illustration', 'motion design'],
    addedDaysAgo: 34,
    appliedDaysAgo: 30,
    matchScore: 38,
    breakdown: {
      matchedSkills: [],
      missingSkills: ['brand identity', 'illustration'],
      experienceFit: 'match',
      verdict: 'Weak fit — this is a brand/visual role, not product. Skip similar postings.',
    },
  },
];

export async function loadSampleData(): Promise<void> {
  const resume = await saveResume(SAMPLE_RESUME);
  const now = Date.now();
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString();

  const jobs = SEEDS.map((s) =>
    makeJob({
      company: s.company,
      roleTitle: s.roleTitle,
      jdText: `${s.roleTitle} at ${s.company}. ${s.location ?? ''} ${s.workMode ?? ''}. Requires ${s.skillsRequired.join(', ')}. Experience: ${s.experienceRequired ?? 'n/a'}. (sample posting)`.trim(),
      jdSource: 'paste',
      status: s.status,
      location: s.location,
      workMode: s.workMode,
      salaryBand: s.salaryBand,
      experienceRequired: s.experienceRequired,
      skillsRequired: s.skillsRequired,
      dateAdded: iso(s.addedDaysAgo),
      statusChangedAt: iso(s.appliedDaysAgo ?? s.addedDaysAgo),
      dateApplied: s.appliedDaysAgo != null ? iso(s.appliedDaysAgo) : undefined,
      matchScore: s.matchScore,
      scoreBreakdown: s.breakdown,
      scoredAgainstResumeVersion: s.matchScore != null ? resume.version : undefined,
      notes: '',
    }),
  );
  await db.jobs.bulkAdd(jobs);
}

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.jobs, db.resume, db.screenshots, async () => {
    await db.jobs.clear();
    await db.resume.clear();
    await db.screenshots.clear();
  });
}
