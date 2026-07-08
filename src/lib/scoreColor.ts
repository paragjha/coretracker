// Central mapping of a match score to its color band.
// Bands (from the build guide / design system): 75+ strong, 50-74 moderate, <50 weak.

export type ScoreBand = 'strong' | 'moderate' | 'weak';

export function scoreBand(score: number): ScoreBand {
  if (score >= 75) return 'strong';
  if (score >= 50) return 'moderate';
  return 'weak';
}

// Neubrutalist: solid semantic fills on ink-bordered pills. Text color coded
// separately for mono numbers in dense table cells. All resolve to tokens.
const BAND: Record<ScoreBand, { text: string; chip: string }> = {
  strong: { text: 'text-strong', chip: 'bg-green text-white' },
  moderate: { text: 'text-moderate', chip: 'bg-yellow text-ink' },
  weak: { text: 'text-weak', chip: 'bg-red text-white' },
};

export function scoreTextClass(score: number): string {
  return BAND[scoreBand(score)].text;
}

export function scoreChipClass(score: number): string {
  return BAND[scoreBand(score)].chip;
}
