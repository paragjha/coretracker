// Single place to swap model ids. Gemini "flash" models are on the free tier
// and handle both image (vision extraction) and text (scoring / paste-sort).
// Alternatives: 'gemini-2.0-flash' (higher free rate limits), 'gemini-2.5-pro'.
export const EXTRACTION_MODEL = 'gemini-2.5-flash';
export const SCORING_MODEL = 'gemini-2.5-flash';
