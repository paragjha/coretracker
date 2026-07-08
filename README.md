# CoreTracker v2

Local-first job-application tracker with screenshot-based JD extraction, in-tool
resume management, and resume↔JD match scoring. Personal tool, single user, no
backend — all data lives in your browser's IndexedDB.

## Stack

React + TypeScript + Vite + Tailwind. Data in IndexedDB via Dexie (nothing
server-side — each browser holds its own data). AI (vision extraction + match
scoring) runs on the **Google Gemini API** (free tier): called directly in local
dev, or through a one-file serverless proxy when deployed so the key stays
secret (see Deploying below).

## Setup

```bash
npm install
cp .env.example .env.local   # then paste your Gemini API key
npm run dev
```

Get a free key at **https://aistudio.google.com/apikey**, then in `.env.local`:

```
VITE_GEMINI_API_KEY=...
```

Restart the dev server after adding the key so Vite picks it up.

> ⚠️ The API key ships in the browser bundle. This is acceptable for a personal
> local tool. **Do not deploy this app publicly with a real key in it.**

The non-AI features (the sheet, resume editor + PDF upload, kanban, CSV export)
work without a key. Screenshot extraction, paste-sort, and match scoring use
Gemini and require the key.

## Features

- **Sheet** — sortable/filterable grid of all jobs; add manually or from
  screenshots; inline-editable detail slide-over; column visibility toggle.
- **Add a job** — two modes in the slide-over: **Paste & sort** (paste the whole
  posting and the model extracts the fields for you to review) or **Manual
  entry**. Or skip the modal entirely: **paste a job description anywhere on the
  sheet (Ctrl/Cmd+V)** and it auto-sorts into a review form. Paste & sort needs
  an API key; manual entry always works (a keyless paste just pre-fills the JD).
- **Screenshots** — "Add from screenshot" via file picker, drag-drop onto the
  sheet, or Ctrl/Cmd+V paste. Multiple images queue and process one at a time.
  Every extraction passes through a human review form before a row is created;
  the original image is kept and shown in the row detail forever.
- **Resume** — a single base resume edited in-tool (markdown + preview).
  **Upload a PDF** to pull its text straight into the editor (parsed locally, no
  key needed), or paste text. Saving bumps a version with one-step undo. The
  saved version is always the scoring baseline, and editing it flags existing
  scores as stale.
- **Scoring** — per-job match score (0–100) with a color band, a breakdown
  (matched/missing skills, experience fit, verdict), and per-row / rescore-all
  triggers. Missing skills double as tailoring notes.
- **Pipeline** — a stats strip (to-apply, applied this week, in interview,
  response rate), a 14-day no-response flag with one-click ghosting, and CSV
  export of the whole sheet.
- **Kanban** — a second view over the same data. Drag cards between columns to
  change status; dropping into Applied auto-sets the applied date. Rejected and
  Ghosted columns are collapsed by default.

## Scripts

- `npm run dev` — dev server
- `npm run build` — typecheck + production build
- `npm run preview` — preview the production build

## Design system

Implements the **CoreTracker Design System v2.4 (Neubrutalist · ATS)**: warm
paper canvas, tangerine accent, ink borders, hard offset shadows, sharp corners,
Space Grotesk display + Space Mono for figures/labels. All values live as
CSS-variable tokens in [`src/index.css`](src/index.css), mirrored into Tailwind
in [`tailwind.config.js`](tailwind.config.js) and consumed by the primitives in
`src/components/ui/`. Restyling is a token edit in one place.

## Deploying (Vercel)

The app is a static site plus one serverless function ([`api/gemini.ts`](api/gemini.ts))
that proxies Gemini so the key is **never** shipped to the browser.

**Data isolation is automatic:** there's no shared database. Every person's jobs,
resume, and scores live only in their own browser's IndexedDB, on their own
device. Two visitors to the same URL never see each other's data.

Steps:

1. Push this folder to a GitHub repo.
2. On [vercel.com](https://vercel.com), **Add New → Project** and import the repo
   (Vercel auto-detects Vite via [`vercel.json`](vercel.json)).
3. **Settings → Environment Variables**, add:
   ```
   GEMINI_API_KEY = <your key>
   ```
   ⚠️ Name it exactly `GEMINI_API_KEY` — **not** `VITE_GEMINI_API_KEY`. A `VITE_`
   prefix would bake the key into the public bundle, which is what we're avoiding.
4. **Deploy.** Visit the URL, add a job / score it — the browser calls
   `/api/gemini`, which adds the key server-side.

How the two environments differ:

| | Local dev (`npm run dev`) | Deployed (Vercel) |
|---|---|---|
| Env var | `VITE_GEMINI_API_KEY` in `.env.local` | `GEMINI_API_KEY` in Vercel |
| Where the key lives | your machine | the serverless function only |
| Call path | browser → Gemini directly | browser → `/api/gemini` → Gemini |

The proxy has guardrails ([`api/gemini.ts`](api/gemini.ts)): a model allowlist,
payload size caps, and a best-effort per-IP rate limit so a public deploy can't
drain your free-tier quota. For hard limits, front it with Vercel KV / Upstash.

> Other hosts (Netlify, Cloudflare Pages) work too, but the function format
> differs — the `api/gemini.ts` handler shape is Vercel's. Ask if you want a
> Netlify/Cloudflare version.

## Model configuration

Gemini model ids for extraction and scoring live in
[`src/lib/api/models.ts`](src/lib/api/models.ts) (default `gemini-2.5-flash`) —
swap them there. All provider code is isolated in
[`src/lib/api/`](src/lib/api) + [`api/gemini.ts`](api/gemini.ts).
