# CoreTracker v2 — Complete Reference

Everything about the project in one place: what it is, how it's built, why the
architecture is the way it is, how to run and deploy it, and what's left.

> Companion doc: [`CASE_STUDY.md`](CASE_STUDY.md) is the portfolio-narrative cut
> of this same material (problem → process → outcome). This file is the
> complete technical + product reference.

---

## 1. At a glance

| | |
|---|---|
| **What** | Local-first job-application tracker with AI capture and resume↔JD match scoring |
| **Live** | https://coretracker-rho.vercel.app/ |
| **Repo** | https://github.com/paragjha/coretracker |
| **Stack** | React 19 · TypeScript · Vite · Tailwind 3 · Dexie (IndexedDB) · Google Gemini |
| **Hosting** | Vercel — static build + two serverless functions |
| **Cost** | ₹0 — free static hosting, Gemini free tier |
| **Backend** | None for data. Two thin serverless functions for AI + link fetching only |

**The pitch in one line:** *"What should I apply to next?"* — a tracker that
scores every posting against your actual resume, so the queue sorts itself.

---

## 2. The problem it solves

Job hunting degrades into a messy spreadsheet:

1. **Capture friction** — copying company/role/salary/skills field-by-field from
   a posting is tedious enough that you skip fields, or skip tracking entirely.
2. **No fit signal** — a spreadsheet can't tell you which of 40 saved postings
   deserves your next hour. Everything looks equally urgent.
3. **Stale context** — you update your resume; old judgments about fit don't
   update with it, and nothing tells you they're now out of date.

---

## 3. Quick start

```bash
npm install
cp .env.example .env.local     # then paste your Gemini key
npm run dev                    # http://localhost:5173
```

Get a free key at **https://aistudio.google.com/apikey**.

```env
# .env.local — local dev only (gitignored via *.local)
VITE_GEMINI_API_KEY=...
```

| Script | Does |
|---|---|
| `npm run dev` | Dev server (includes the `/api/fetch-jd` dev middleware) |
| `npm run build` | `tsc -b` typecheck + production build |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | oxlint |

**Without a key**, everything except AI still works: the sheet, kanban, resume
editor + PDF upload, CSV export, backup/restore. Screenshot extraction,
paste-sort, add-by-URL sorting and match scoring need the key.

---

## 4. Architecture

### 4.1 Local-first: the data never leaves the browser

Every job, resume, and screenshot lives in **IndexedDB** in the visitor's own
browser. There is no shared database.

This is the whole answer to *"if I deploy this and share it, will my data leak
to my friends?"* — **no, structurally.** Each browser is an isolated store;
there's no server for data to mix in, and no accounts needed to enforce it.

- ✅ Different people on different devices → completely separate data
- ⚠️ Same person, different devices → *also* separate (no sync — see §12)
- ⚠️ Two people sharing one browser profile → same data

### 4.2 AI is isolated behind one function

All model calls funnel through `generateJson()` in `src/lib/api/client.ts`.
This paid off concretely: the project **swapped its entire AI provider
(Anthropic → Google Gemini) without touching a single UI, view, or data file.**

### 4.3 The key-exposure problem, solved by environment

A client-side API key is fine for a single-user local tool. It is *not* fine on
a public URL — anyone could read it out of the JS bundle.

The client detects its own environment and takes different paths:

```
LOCAL DEV   browser ──(VITE_GEMINI_API_KEY)──▶ Gemini     (key stays on your machine)
PRODUCTION  browser ──▶ /api/gemini ──(GEMINI_API_KEY)──▶ Gemini
                        ↑ key lives here, server-side only
```

The production bundle contains no key at all. This also permanently removes any
CORS question, since the browser only ever talks to its own origin.

### 4.4 Two serverless functions

| Function | Purpose | Guards |
|---|---|---|
| `api/gemini.ts` | Proxies AI calls, holds the key | Model allowlist, payload caps, 30 req/min/IP |
| `api/fetch-jd.ts` | Fetches a job posting by URL | SSRF blocklist, 12s timeout, 5MB cap, 20 req/min/IP |

`api/_jdFetcher.ts` holds the shared fetch/clean logic (files under `api/`
prefixed `_` aren't deployed as their own function). **`vite.config.ts` serves
`/api/fetch-jd` in dev from that same module** — one implementation, identical
behavior in dev and production, no drift.

---

## 5. Data model

`src/types/types.ts` is the single source of truth.

```ts
type JobStatus = 'to_apply' | 'applied' | 'interviewing' | 'offer' | 'rejected' | 'ghosted';

interface Job {
  id: string;
  company: string;
  roleTitle: string;
  jdText: string;
  jdSource: 'paste' | 'screenshot';
  screenshotRef?: string;        // → screenshots table
  status: JobStatus;
  dateAdded: string;             // ISO
  dateApplied?: string;
  statusChangedAt: string;       // drives days-in-status + the 14-day flag
  salaryBand?: string;           // as written; never currency-converted
  location?: string;
  workMode?: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  contactEmail?: string;
  contactName?: string;
  applyUrl?: string;             // also the duplicate-detection key
  skillsRequired: string[];
  experienceRequired?: string;
  notes: string;
  matchScore?: number;           // 0–100
  scoreBreakdown?: ScoreBreakdown;
  scoredAgainstResumeVersion?: number;   // stale-score detection
}

interface ScoreBreakdown {
  matchedSkills: string[];
  missingSkills: string[];       // doubles as tailoring notes
  experienceFit: 'under' | 'match' | 'over';
  verdict: string;
}

interface Resume {
  id: 'base';                    // exactly one
  content: string;               // markdown
  previousContent?: string;      // one-step undo
  version: number;               // increments per save
  updatedAt: string;
}
```

**Dexie tables:** `jobs`, `resume`, `screenshots` (blobs kept separate so the
jobs table stays light).

`statusChangedAt` is a deliberate addition beyond the original spec — without
it, days-in-status, kanban ordering, and the no-response flag are all
impossible.

---

## 6. Feature reference

### 6.1 Four ways to capture a job

| Method | Flow | Needs key |
|---|---|---|
| **From link** *(default)* | Paste URL → fetched server-side → sorted → review | Yes |
| **Screenshot** | File picker / drag-drop / Ctrl+V → vision model → review | Yes |
| **Paste & sort** | Paste the whole JD → sorted → review | Yes |
| **Manual** | Type the fields | No |

**Shortcut:** paste *anywhere on the sheet* — a bare URL routes to the fetcher,
a long blob of prose routes to the sorter. This collapses the
"see job on phone → message it to myself → open laptop → copy → paste" loop
into a single paste.

**Every path passes through a human review form.** Nothing is auto-inserted.

**Add-by-URL specifics:**
- Prefers schema.org **JSON-LD `JobPosting`** (Greenhouse, Lever, Workday and
  LinkedIn all publish it) — far cleaner than scraped markup. Falls back to
  HTML-to-text.
- **LinkedIn** normally sits behind an auth wall; the fetcher extracts the job
  ID and uses the public `jobs-guest` endpoint, which returns the full posting
  without a login. Handles `/jobs/view/123`, slug-suffixed URLs, and
  `?currentJobId=`.
- Any failure falls back to paste mode with guidance — never a dead end.
- The source URL is kept as `applyUrl`, which is what makes duplicate detection
  work on re-adds.

**Duplicate detection** warns (with an explicit *Add anyway*) when the apply URL
matches — ignoring `utm_*`/`refId`/`trackingId` params that aggregators append
per visit — or when company + role title match, case/whitespace-insensitively.

### 6.2 Match scoring

Sends your **full resume** + the job's **description, required skills, and
experience requirement** to Gemini. It's **semantic, not keyword matching**:
"led the design-system rebuild" counts as evidence for "design systems," while
listing "Figma" once does *not* satisfy "advanced Figma."

**Rubric:**

| Weight | Factor |
|---|---|
| 40% | Skills *evidenced* in the resume |
| 25% | Experience-level fit |
| 20% | Role-trajectory fit |
| 15% | Domain / industry fit |

- **Hard skills carry the score.** Generic soft skills (communication,
  collaboration, teamwork) are explicitly barred from padding `matchedSkills`
  or lifting the number — they're near-universal and inflate everything equally.
- **`experienceFit` is defined relative to the role's stated requirement.** A
  5-year candidate on a role asking 0–2 years genuinely *is* "over" — the UI
  shows *"Over-qualified — role asks 0–2 years"* so it reads as correct rather
  than looking like a bug.
- Temperature 0.2 for stability — the same job scored twice lands within a few
  points.

**Bands:** 75+ strong (green) · 50–74 moderate (yellow) · <50 weak (red).

**Triggers:** auto-scores on add (if a resume exists) · one-click **Score**
button in the sheet's Match column · Rescore in the detail drawer · Rescore-all
for stale jobs (defaults to `to_apply` only, so tokens aren't burned on
already-rejected roles).

**Stale detection:** every score records `scoredAgainstResumeVersion`. Editing
your resume bumps its version, and any score computed against an older one is
shown muted with a `*` and a tooltip — still visible, but visibly downgraded in
authority until rescored.

### 6.3 Resume

One base resume, edited in-tool. **Upload a PDF** (parsed locally via pdfjs — no
API key, nothing uploaded) or paste markdown. Saving increments the version and
keeps exactly one step of undo. The saved version is always the scoring baseline.

### 6.4 Pipeline & prioritization

- Opens on **`to_apply`, sorted by match score descending** — literally "what
  should I do next."
- **Stats strip:** to-apply · applied this week · in interview · response rate.
- **Response rate** = replies ÷ applications older than **7 days**. Below that
  it shows "—" with an explanation, because a fresh batch of applications would
  otherwise drag it to a demoralising and meaningless 0%. A rejection counts as
  a reply; silence and ghosting don't.
- **14-day no-response flag** on applied jobs, with one-click → ghosted.
- **CSV export** for spreadsheets.

### 6.5 Two views, one truth

Sheet and Kanban render the same table. Dragging a card between kanban columns
runs the **exact same** `statusChangePatch()` the sheet's status menu uses —
including auto-stamping `dateApplied` on entry to Applied — so the two views
can't drift apart.

Rejected and Ghosted columns are collapsed by default so dead applications
don't eat screen space.

### 6.6 Data safety

Because everything lives in one browser, losing it is a real risk (one
"clear browsing data" and months of pipeline are gone).

| Feature | Behavior |
|---|---|
| **JSON backup** | Lossless — jobs, resume, and screenshots (as data URLs) |
| **Import** | **Merges by id**; never silently wipes rows the file doesn't mention. The resume is only overwritten if the backup isn't older |
| **Backup nudge** | Quiet chip after 25+ jobs or 14 days since the last backup |
| **Undoable delete** | Row hides instantly; the DB delete is deferred 10s behind an Undo toast |
| **Clear data** | Type-to-confirm — the button stays disabled until you type `CLEAR` |

CSV is kept for spreadsheets but is **lossy** (drops skills arrays, score
breakdowns, screenshots) — JSON is the actual recovery path.

---

## 7. The AI layer

| | |
|---|---|
| **Model** | `gemini-2.5-flash` (extraction + scoring), swappable in `src/lib/api/models.ts` |
| **Output** | `responseMimeType: 'application/json'` — clean JSON, no fences to strip |
| **Latency** | `thinkingBudget: 0` disables 2.5's hidden reasoning pass → **~1.5s** scoring, down from several seconds, with no measurable quality loss on these scoped tasks |
| **Quota** | Typed `QuotaExceededError` on 429/RESOURCE_EXHAUSTED. Friendly copy, raw detail preserved in `cause`, and **the save is never blocked** — a job saves unscored and can be scored later |

**Defensive parsing throughout:** strip fences → `try/catch` JSON.parse → on
failure the raw text still lands in the JD field, so nothing the user pasted is
ever lost. `{"error": "not_a_job_posting"}` is handled explicitly.

---

## 8. Design system

Implements **CoreTracker Design System v2.4 — "Neubrutalist · ATS"**, authored
separately as a Claude Design spec and reverse-engineered into code by rendering
it and reading computed styles (exact hexes, shadow offsets, border widths)
rather than eyeballing a screenshot.

**Principles (from the spec's own pillars):** *Aesthetics of Utility* — density
and legibility over decoration · *Feedback & Continuity* — every action gets an
immediate visual reaction · *Deterministic Placement* — controls where muscle
memory expects them.

| Token | Value |
|---|---|
| Canvas | `#F1EADB` warm paper |
| Ink | `#141210` (text **and** all borders) |
| Accent | `#FF6A1F` tangerine |
| Semantic | green `#1E7A46` · yellow `#F7C948` · red `#E23B2E` · blue `#2C7DC0` · purple `#7A3E9C` |
| Display | **Space Grotesk** 700, tight tracking |
| Mono | **Space Mono** — figures, IDs, uppercase micro-labels |
| Radius | `0` everywhere (pills only for tags/status) |
| Elevation | Hard offset shadows, `5px 5px 0`, **no blur** |

**Interaction signature:** elements rest on a hard shadow; hover nudges toward
the shadow and deepens it; active slams flush. A tactile press, not a fade.

**Accessibility is in the source spec, not bolted on:** documented contrast
pairs (ink-on-paper 15.8:1, ink-on-tangerine 9.1:1), state never carried by
color alone (every status pill pairs color with a dot + label), visible
high-contrast focus rings.

Every value is a CSS custom property in `src/index.css`, mirrored into Tailwind.
**Restyling the entire app is a one-file token edit.**

---

## 9. Security

| Concern | Handling |
|---|---|
| **API key exposure** | Never in the production bundle; lives server-side in the proxy |
| **SSRF** (the link fetcher takes arbitrary URLs) | http/https only; blocks localhost, `.local`/`.internal`, loopback, link-local **including the `169.254.169.254` cloud-metadata endpoint**, and all RFC1918 ranges |
| **Quota abuse** | Per-IP rate limits on both functions; model allowlist; payload size caps |
| **Runaway fetches** | 12s timeout, 5MB response cap, 120k char text cap |
| **Secrets in git** | `.env.local` gitignored via `*.local`; verified absent from the repo |

The metadata-endpoint block matters most — without it, a crafted URL could have
made the server fetch Vercel's own credentials and hand them back.

**Known limits:** the in-memory rate limiters reset on serverless cold starts
(good enough to deter casual abuse; upgrade to Vercel KV / Upstash for hard
limits). SSRF validation is on the initial URL — a redirect chain into a private
range isn't separately re-validated.

---

## 10. Deployment

Static build + serverless functions on Vercel, auto-deploying on push to `main`.

1. Push to GitHub.
2. Vercel → **Add New → Project** → import the repo (auto-detects Vite via `vercel.json`).
3. **Settings → Environment Variables:** add `GEMINI_API_KEY` — **without** the
   `VITE_` prefix. A `VITE_`-prefixed variable is inlined into the public bundle;
   that's exactly what the proxy exists to avoid.
4. Deploy.

> Changing an env var does **not** update the running deployment — trigger
> **Deployments → ⋮ → Redeploy**.

---

## 11. File map

```
api/
  _jdFetcher.ts      shared fetch + HTML→text + JSON-LD + SSRF guards
  fetch-jd.ts        Vercel function wrapper
  gemini.ts          AI proxy (holds the key)
src/
  App.tsx            shell, view switching (persisted), undo-toast host
  types/types.ts     data model — single source of truth
  lib/
    db/db.ts         Dexie schema
    jobs.ts          CRUD + findDuplicate()
    statusChange.ts  THE status-transition path (sheet + kanban share it)
    resume.ts        versioning + one-step undo
    pipeline.ts      stats, response rate, no-response flag
    scoreActions.ts  scoring triggers, stale detection
    scoreColor.ts    score → band
    backup.ts        JSON export/import + nudge
    undoableDelete.ts  10s grace-period delete
    csv.ts / pdf.ts / markdown.ts / sampleData.ts / screenshotQueue.ts
    api/
      client.ts      generateJson() — dual path, quota errors
      extract.ts     vision + text extraction prompts
      score.ts       scoring prompt + rubric
      fetchJd.ts     client for /api/fetch-jd
      models.ts      model ids
  views/             SheetView · KanbanView · ResumeView
  components/        AddJobForm · JobDetailPanel · ScreenshotReview ·
                     ScoreBreakdownPanel · PipelineStrip · JobFields ·
                     UndoToastHost · ui/{primitives,overlays}
```

---

## 12. Known gaps / roadmap

**Next up:**

1. 🔴 **Responsive pass** — the sheet renders ~1,870px wide with essentially one
   media query. Add-by-URL exists *because* jobs are found on the phone, but the
   app can't be used there yet, so that half of the loop stays broken. Plan:
   priority columns on narrow viewports (Company · Role · Match · Status),
   snap-scrolling kanban columns, full-screen drawer.
2. **Follow-up mechanics** — per-job next-action + due date, a "2 follow-ups due"
   chip, and a suggestion (never an auto-move) at 14 days.
3. **Drawer a11y** — Esc-to-close and `role="dialog"` are there, but it needs a
   focus trap and `aria-labelledby`.

**Deliberately deferred:**

- **PWA + share-target** (share a link from the LinkedIn app straight into
  CoreTracker) — this requires solving sync first, since phone and laptop have
  separate local storage. The honest framing: *local-first was the right v1
  call; share-target is exactly what forces v2 to grow a backend.*
- Full resume version history (v1 keeps current + one-step undo on purpose).
- Accounts — avoided entirely to preserve the zero-backend guarantee.

---

## 13. Operational notes & gotchas

- **Env changes need a restart** — Vite inlines `import.meta.env` at server
  start; editing `.env.local` requires restarting `npm run dev`.
- **Dev vs production AI paths differ by design.** Local dev calls Gemini
  directly (fast, no function needed); production goes through the proxy. If you
  set `VITE_GEMINI_API_KEY` in Vercel you'd silently re-expose the key — don't.
- **Free-tier quota** is per-day. Scoring one job at a time is fine; a
  "Rescore all" across dozens may hit the ceiling. That's surfaced as a friendly
  message, not a raw error, and never blocks saves.
- **Clearing site data wipes everything.** Export a JSON backup first.
- **Not deployable with a client-side key.** Keep the proxy path for anything public.

---

## 14. Build history

| Commit | Contents |
|---|---|
| `1db6ef8` | Initial v2 — all 7 phases: data model, sheet, resume, screenshot extraction, scoring, pipeline, kanban; neubrutalist design system; Gemini swap; serverless proxy; PDF upload; paste-and-sort |
| `b9164d9` | **Data safety** — JSON backup/restore with merge semantics, type-to-confirm on Clear data, undoable delete with 10s grace period |
| `1e9d1d4` | **Accuracy & UX** — response-rate redefinition, `experienceFit` disambiguation, hard-skill weighting, duplicate detection, quota resilience, keyboard-accessible rows, inline status menu |
| `755db60` | **Add by URL** — server-side fetcher with JSON-LD + LinkedIn guest endpoint, SSRF guards, dev/prod parity middleware, full Latin-1 entity decoding |

### Notable bugs caught during the build

- **HTML entity decoding** — only ~12 named entities were mapped, so `&eacute;`
  passed through raw; "Café", "Zürich", "Peña" would have landed in company
  names as literal garbage. Now maps the full Latin-1 set, case-sensitively.
- **Stale-closure duplicate check** — "Add anyway" set state then immediately
  called `save()`; React wouldn't have flushed it, so it would have re-warned in
  a loop. Changed to a parameter.
- **`dateApplied` desync** — a status change could set the date underneath an
  open drawer without the form reflecting it.
- **Audit false positive** — an external review reported "zero confirmation
  dialogs" from a bundle grep for `confirm()` / "Are you sure". Both dialogs
  already existed as a custom component with different wording. The *real* gaps
  beneath it (no undo, no type-to-confirm) were genuine and are now fixed.
  Worth remembering: verify audit claims against source, not just bundle greps.
