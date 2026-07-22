# CoreTracker v2 — Case Study Source Notes

*Raw material for a portfolio case study. Written to be quoted from directly —
trim, reorder, and add screenshots as needed. Sections roughly follow a
standard case-study shape: overview → problem → process → design → engineering
→ challenges → outcome → what's next.*

---

## 1. Overview

**CoreTracker v2** is a local-first job-application tracker: screenshot- and
paste-based JD capture, resume-to-JD match scoring, and pipeline management
across a sheet and kanban view — built and deployed as a personal tool and
portfolio piece.

| | |
|---|---|
| **Role** | Product designer, sole builder (spec + design system authored by you; implementation paired with an AI coding agent) |
| **Type** | Personal tool → public portfolio piece |
| **Timeline** | Single continuous build, phased (7 phases + iterative hardening) |
| **Stack** | React 19, TypeScript, Vite, Tailwind, Dexie.js (IndexedDB), Google Gemini API |
| **Live** | https://coretracker-rho.vercel.app/ |
| **Repo** | https://github.com/paragjha/coretracker |

**One-line pitch:** *"What should I apply to next?"* — a tracker that scores
every job against your actual resume instead of leaving that judgment to
memory and a spreadsheet.

---

## 2. Problem

Job hunting tends to degrade into a messy spreadsheet: postings pasted in
without structure, no consistent read on fit, and no memory of *why* a resume
version matched a role. Three specific gaps CoreTracker targets:

1. **Capture friction.** Copying job details field-by-field from a posting is
   tedious enough that people skip fields or skip tracking altogether.
2. **No fit signal.** A spreadsheet doesn't tell you which of 40 saved postings
   is actually worth your next hour. Everything looks equally urgent.
3. **Stale context.** Resumes get updated; old match judgments don't — nothing
   flags that a score was computed against a resume you've since changed.

**Design constraint self-imposed from the start:** local-first, single user,
no backend. The tool had to be honest about what that means (Section 6) rather
than quietly betraying it later.

---

## 3. Process — how it was built

The build followed a **phased functional spec** (client-supplied build guide),
implemented phase by phase with a working, testable slice at the end of each:

| Phase | Delivered |
|---|---|
| 0 | Project scaffold, full typed data model, Dexie/IndexedDB schema |
| 1 | The sheet — sortable/filterable grid, manual add, inline-editable detail drawer, delete |
| 2 | Resume management — versioned single base resume, one-step undo, stale-score detection |
| 3 | Screenshot capture — file picker / drag-drop / clipboard paste, sequential queue, mandatory human review before any row is created |
| 4 | AI match scoring — resume↔JD comparison, weighted rubric, breakdown UI |
| 5 | Prioritization — pipeline stats strip, 14-day no-response flag, CSV export |
| 6 | Kanban — second view over the same data, drag-and-drop status changes, shared status-transition logic with the sheet |

**Decisions locked at spec time (not relitigated mid-build):**
- Single base resume, edited in-tool; current version is always the scoring
  baseline; one-step undo only (no full version history in v1).
- No automatic rescore on resume save — manual per-row rescore + a
  "rescore all stale" action scoped to `to_apply` jobs by default (avoids
  silently burning API calls on jobs already rejected or applied).
- Screenshot is the primary intake path; paste is the fallback — extraction
  always lands in a **human review form**, never auto-inserts a row.

**Post-spec iteration** (the "make it actually usable" pass, done after the
phased build):
- **PDF resume upload** — client-side text extraction (pdfjs), no AI call
  needed, works with zero API key.
- **"Paste & sort"** — paste an entire job description anywhere on the sheet
  (Ctrl/Cmd+V) and the model sorts it into fields for review, instead of
  requiring the Add-Job modal to be open first.
- **One-click Score button** inline in the sheet's Match column (originally
  scoring only lived inside the detail drawer — real use surfaced that as
  friction).
- **Auto-score on add** — if a resume exists, adding a job (any path) scores it
  immediately instead of leaving it in a manual queue.
- **Sample data + Clear-data actions** — added once the tool needed to work as
  a portfolio demo for a stranger with an empty database.

---

## 4. Design system

Visual direction: **"CoreTracker Design System v2.4 — Neubrutalist · ATS"** —
authored as a standalone Claude Design spec, then reverse-engineered into
implementation by rendering the spec and reading its computed styles directly
(exact colors, shadow offsets, border widths, type scale) rather than
eyeballing it from a screenshot.

**Documented pillars** (from the design system's own principles page):
- *Aesthetics of Utility* — forms, dashboards, and tables prioritize structural
  density and legibility over visual fluff.
- *Feedback & Continuity* — every action triggers an immediate, predictable
  visual reaction.
- *Deterministic Placement* — controls sit where muscle memory expects
  (destructive actions isolated, primary actions anchored consistently).

**Token system** (all implemented as CSS custom properties, one file):

| Token | Value | Use |
|---|---|---|
| Canvas | `#F1EADB` warm paper | page background |
| Ink | `#141210` near-black | text, all borders |
| Accent | `#FF6A1F` tangerine | primary actions, active states |
| Semantic | green `#1E7A46` / yellow `#F7C948` / red `#E23B2E` / blue `#2C7DC0` / purple `#7A3E9C` | status, score bands |
| Display type | **Space Grotesk**, 700 weight, tight tracking | headings, UI labels |
| Mono type | **Space Mono** | figures, IDs, uppercase micro-labels |
| Radius | `0px` everywhere | sharp corners, no exceptions |
| Elevation | hard offset shadows (`5px 5px 0 0`, no blur) | the signature "pressable" affordance |

**Interaction signature:** buttons/cards sit on a hard shadow at rest; hover
nudges the element toward the shadow origin and deepens it slightly; active
slams it flush — a tactile "press," not a fade.

**Accessibility baked into the source spec, not bolted on after:**
WCAG 2.1 AA contrast pairs specified (ink-on-paper 15.8:1, ink-on-tangerine
9.1:1, white-on-green 5.2:1); state is never carried by color alone — every
status pill pairs color with a dot + label; visible high-contrast focus rings
throughout.

**Every value is a token, one file.** Restyling the whole app — should the
design system ever revise — is a single-file edit, not a component-by-component
hunt.

---

## 5. Key features, by user moment

**Capture a job in under 5 seconds.**
Screenshot a posting (drag it onto the sheet, paste from clipboard, or use the
file picker) → vision model extracts company, role, location, salary,
skills, work mode, contact, apply URL → review form shows the extraction next
to the source image → confirm. Or skip the screenshot: paste the raw JD text
anywhere on the sheet and the same sorting happens on text instead of pixels.
Either path ends at the same human review gate — nothing is ever silently
inserted.

**Know what to apply to next.**
The sheet's default view is `to_apply`, sorted by match score descending — the
literal answer to "what should I work on right now." Each job carries a score
(0–100), a color band, and — expandable — a breakdown of matched skills,
missing skills (doubling as *tailoring notes* for that specific application),
experience fit, and a one-line verdict.

**Trust the score, know when to distrust it.**
Editing the resume bumps its version. Any job scored against an older version
gets a visibly muted, tooltip-flagged "stale" badge in place of its color —
the score is still shown, but its authority is visually downgraded until
rescored.

**Two views, one truth.**
Sheet and Kanban render the same IndexedDB table. Dragging a card between
Kanban columns runs through the exact same status-transition function the
sheet's dropdown uses — including auto-setting the applied date on drop into
"Applied" — so there is no divergent logic path to keep in sync.

**Don't let applications go silent.**
Any `applied` job untouched for 14+ days surfaces a "no response" flag with a
one-click move to `ghosted`, in both the sheet and Kanban.

---

## 6. Engineering architecture

### No backend, on purpose
Every job, resume, and score lives in **IndexedDB (via Dexie.js)**, scoped to
the visitor's own browser. This wasn't a cost-cutting shortcut — it's the
actual answer to "how do I make sure my data and my friends' data never mix
when we all use the same deployed URL": there's no shared database for the
data to mix *in*. Each browser is a hard boundary. It also means zero backend
infrastructure to run or pay for beyond static hosting.

### AI is fully isolated behind one interface
All model calls live in `src/lib/api/` behind a single `generateJson()`
entry point. This paid off directly: the project **swapped its entire AI
provider (Anthropic → Google Gemini, for the free tier) without touching any
UI, data, or view code** — only the client and prompt-plumbing layer changed.

### The key-exposure problem, solved by environment
A client-side API key is fine for a single-user local tool — it never leaves
the machine. It stops being fine the moment the same code is deployed
publicly. The fix: a **same-origin serverless proxy** (`api/gemini.ts`,
Vercel Node function) that holds the real key server-side; the client detects
whether it has a local dev key and calls Gemini directly, or — with none
present — POSTs to `/api/gemini` instead. Local dev and production literally
run different code paths without any manual toggle.

The proxy isn't a bare pass-through — it has its own guardrails, since a
public portfolio URL is a target for casual abuse of a free-tier quota:
- **Model allowlist** (rejects anything not explicitly permitted)
- **Payload size caps** (text and image separately)
- **Per-IP rate limiting** (in-memory, intentionally simple — good enough to
  deter casual abuse; noted in the code as the upgrade point if it ever needs
  to be bulletproof)

### Performance tuning that mattered
Gemini 2.5's default "thinking" pass added several seconds of latency to a
scoped, low-stakes call (extract fields, score a fit). Disabling it
(`thinkingConfig.thinkingBudget: 0`) cut scoring latency from several seconds
to **~1.5s**, with no measurable quality loss on the same test cases — a case
of a model default being tuned for the wrong shape of task.

### Bundle size, addressed twice
- The PDF-parsing library (`pdfjs-dist`) and the Gemini SDK are both
  **dynamically imported** — loaded only when a PDF is actually uploaded, or
  when running in local dev's direct-call mode. The production (proxy) bundle
  never pays for either.
- Net effect: **488 kB → 344 kB** on the main bundle across the provider swap
  and lazy-loading pass, gzip ~108 kB.

### Data model discipline
One `statusChangePatch()` function is the single source of truth for what
happens on a status transition (auto-set `dateApplied`, stamp
`statusChangedAt`) — called identically by the sheet's dropdown and the
Kanban's drag handler, so "the two views can drift out of sync" isn't a class
of bug that can occur.

---

## 7. The match-scoring logic (worth a callout — it's the core value prop)

Scoring is **semantic, not keyword search.** The model reads the full resume
and the full job description and judges fit against a weighted rubric:

- **40%** — skills *evidenced* in the resume (not just named — "listed Figma
  once" ≠ "advanced Figma prototyping")
- **25%** — experience-level fit (under / match / over qualified)
- **20%** — role-trajectory fit (is the resume's arc pointed at this kind of
  role)
- **15%** — domain/industry fit

Output: a 0–100 score, matched skills, missing skills (reframed as tailoring
notes for that specific application), an experience-fit label, and a
two-sentence verdict. Temperature is held low for score stability — the same
job scored twice lands within a few points, not a different number entirely.

---

## 8. Challenges and how they were resolved

| Challenge | Resolution |
|---|---|
| Vision-model provider had a paid key friction point for a portfolio audience | Swapped to Gemini's free tier; the AI layer's isolation made this a contained change |
| Scoring felt slow (several seconds per call) | Disabled Gemini's default thinking pass for scoped tasks; ~3–4× faster |
| A public deploy would expose the API key in the JS bundle | Same-origin serverless proxy holding the key server-side, dual-path client (direct in dev, proxied in prod) |
| A public deploy could also let strangers drain the free-tier quota | Model allowlist + payload caps + per-IP rate limit on the proxy |
| Scoring lived only in a detail drawer — dead-ends after a screenshot/paste add | Added an inline one-click Score affordance directly in the sheet's Match column, plus auto-score on any add |
| A stranger visiting the live portfolio URL sees an empty table | Added a one-click "Load sample data" seed (six realistic jobs + a demo resume) and a "Clear data" reset |
| A stray environment label ("v2 · LOCAL") read as broken on the live deploy | Caught in review; changed to "local-first" — describes the architecture truthfully in every environment instead of the literal hosting location |

---

## 9. Outcome / current state

- Fully deployed, publicly reachable, functioning end to end (screenshot
  extraction, paste-and-sort, scoring, resume PDF upload, kanban drag-drop, CSV
  export) — verified against the live Gemini API, not just locally.
- Zero ongoing infrastructure cost: static hosting + one serverless function on
  Vercel's free tier, Gemini's free tier for inference.
- Genuinely multi-tenant with **zero** shared-data engineering: every visitor
  (you, friends, portfolio viewers) gets an isolated, private instance for
  free, as a consequence of the local-first architecture rather than an
  access-control system bolted on top.

## 10. What's next / open threads

- Hard-cap the proxy's rate limiting with a real store (Vercel KV / Upstash)
  instead of the current in-memory approximation, if usage ever justifies it.
- Full resume version history (v1 intentionally keeps only current + one-step
  undo).
- Consider an optional accounts layer only if "access my data from another
  device" ever becomes a real want — explicitly avoided for v1 to keep the
  zero-backend guarantee.

---

*Screenshots to add when assembling the final case study: empty state with
sample-data prompt, populated sheet (to-apply sorted by score), the review
drawer next to a source screenshot, the score breakdown panel, Kanban board
mid-drag, the resume editor with PDF upload.*
