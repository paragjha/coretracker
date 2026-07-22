import { useEffect, useState } from 'react';
import { createJob, findDuplicate } from '../lib/jobs';
import { STATUS_LABELS, type Job } from '../types/types';
import { getResume } from '../lib/db/db';
import { scoreJob } from '../lib/api/score';
import { extractFromText, NotAJobPostingError, ExtractionParseError } from '../lib/api/extract';
import { hasApiKey } from '../lib/api/client';
import { fetchJobDescription, JdFetchFailed } from '../lib/api/fetchJd';
import { Button, Segmented, TextArea, TextInput, cx } from './ui/primitives';
import { SlideOver } from './ui/overlays';
import { JobFields, emptyDraft, draftFromExtraction, type JobDraft } from './JobFields';

type Mode = 'link' | 'paste' | 'manual';

// Three ways in: paste a link (fetched server-side, then sorted), paste the
// whole posting, or type it manually. `initialText` lets the sheet hand off
// something pasted onto the grid — a URL opens link mode, prose opens paste
// mode — and either way it runs automatically.
export function AddJobForm({
  open,
  onClose,
  initialText,
  initialUrl,
}: {
  open: boolean;
  onClose: () => void;
  initialText?: string;
  initialUrl?: string;
}) {
  const [draft, setDraft] = useState<JobDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [mode, setMode] = useState<Mode>(hasApiKey() ? 'link' : 'manual');
  const [blob, setBlob] = useState('');
  const [url, setUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<Job | null>(null);

  const patch = (p: Partial<JobDraft>) => setDraft((d) => ({ ...d, ...p }));
  const valid = draft.company.trim() !== '' && draft.roleTitle.trim() !== '';

  const reset = () => {
    setDraft(emptyDraft());
    setBlob('');
    setUrl('');
    setPasteError(null);
    setDuplicateOf(null);
    setMode(hasApiKey() ? 'link' : 'manual');
  };

  const close = () => {
    reset();
    onClose();
  };

  /**
   * Fetches the posting server-side, then hands the text to the same extractor
   * the paste flow uses. On failure it falls back to paste mode rather than
   * dead-ending — the manual path always remains available.
   */
  const fetchFromLink = async (source: string = url) => {
    const target = source.trim();
    if (!target || fetching) return;
    setFetching(true);
    setPasteError(null);
    try {
      const fetched = await fetchJobDescription(target);
      setBlob(fetched.text);
      // Keep the source link so it lands in Apply URL — which also makes the
      // duplicate check work on re-adds of the same posting.
      await extract(fetched.text, { applyUrl: fetched.sourceUrl });
    } catch (e) {
      setMode('paste');
      setPasteError(
        `${e instanceof JdFetchFailed ? e.message : 'Could not fetch that link.'} Paste the description instead.`,
      );
    } finally {
      setFetching(false);
    }
  };

  const extract = async (source: string = blob, seed?: Partial<JobDraft>) => {
    if (!source.trim() || extracting) return;
    setExtracting(true);
    setPasteError(null);
    try {
      const result = await extractFromText(source);
      setDraft((d) => ({ ...draftFromExtraction(result), notes: d.notes, ...seed }));
      setMode('manual'); // drop into the fields to review what was parsed
    } catch (e) {
      if (e instanceof NotAJobPostingError) {
        setPasteError("That doesn't look like a job posting. Check the text or fill fields manually.");
      } else if (e instanceof ExtractionParseError) {
        // Nothing lost: keep the pasted text as the JD and let the user fill the rest.
        setDraft((d) => ({ ...d, jdText: source, ...seed }));
        setMode('manual');
        setPasteError('Could not auto-sort the fields — your text is in the JD box; fill the rest.');
      } else {
        setPasteError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setExtracting(false);
    }
  };

  // Handoff from the sheet: a pasted link goes straight to the fetcher, pasted
  // prose to the sorter (or, without a key, into the JD box for manual entry).
  // Runs once per open.
  useEffect(() => {
    if (!open) return;

    if (initialUrl?.trim()) {
      setMode('link');
      setUrl(initialUrl);
      if (hasApiKey()) void fetchFromLink(initialUrl);
      return;
    }

    if (!initialText?.trim()) return;
    if (hasApiKey()) {
      setMode('paste');
      setBlob(initialText);
      void extract(initialText);
    } else {
      setMode('manual');
      setDraft({ ...emptyDraft(), jdText: initialText });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // `skipDupeCheck` is a parameter rather than state because "Add anyway" calls
  // save() immediately — a setState wouldn't have flushed in time.
  const save = async (skipDupeCheck = false) => {
    if (!valid || saving) return;

    // Warn once on a likely duplicate (same apply URL, or same company+role).
    // Aggregators re-post the same job, and a silent double-add reads as a bug.
    if (!skipDupeCheck) {
      const dupe = await findDuplicate(draft);
      if (dupe) {
        setDuplicateOf(dupe);
        return;
      }
    }

    setSaving(true);
    try {
      const job = await createJob({ ...draft, jdSource: 'paste' });
      // Auto-score against the saved resume so a match score appears right away
      // (same as the screenshot flow). No resume yet → it just stays unscored.
      const resume = await getResume();
      if (resume?.content) {
        setScoring(true);
        try {
          await scoreJob(job, resume);
        } catch (e) {
          console.warn('Auto-score failed; job saved unscored.', e);
        }
      }
      reset();
      onClose();
    } finally {
      setSaving(false);
      setScoring(false);
    }
  };

  return (
    <SlideOver
      open={open}
      onClose={close}
      title="Add job"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          {mode === 'link' ? (
            <Button
              onClick={() => void fetchFromLink()}
              disabled={!url.trim() || fetching || extracting}
            >
              {fetching ? 'Fetching…' : extracting ? 'Sorting…' : 'Fetch & review'}
            </Button>
          ) : mode === 'paste' ? (
            <Button onClick={() => extract()} disabled={!blob.trim() || extracting}>
              {extracting ? 'Sorting…' : 'Extract & review'}
            </Button>
          ) : (
            <Button onClick={() => void save()} disabled={!valid || saving}>
              {scoring ? 'Scoring…' : saving ? 'Saving…' : 'Add job'}
            </Button>
          )}
        </>
      }
    >
      {hasApiKey() && (
        <div className="mb-4">
          <Segmented<Mode>
            options={[
              { value: 'link', label: 'From link' },
              { value: 'paste', label: 'Paste & sort' },
              { value: 'manual', label: 'Manual entry' },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>
      )}

      {mode === 'link' ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">
            Paste a job link — LinkedIn, Greenhouse, Lever, or most job boards. The posting is
            fetched and sorted into fields for you to review.
          </p>
          <TextInput
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void fetchFromLink();
              }
            }}
            placeholder="https://www.linkedin.com/jobs/view/…"
            autoFocus
          />
          {(fetching || extracting) && (
            <p className="flex items-center gap-2 text-xs font-bold text-ink-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              {fetching ? 'Fetching the posting…' : 'Sorting the fields…'}
            </p>
          )}
          {pasteError && <p className="text-xs font-bold text-weak">{pasteError}</p>}
        </div>
      ) : mode === 'paste' ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">
            Paste the entire job posting — the tool sorts it into fields for you to review before
            adding.
          </p>
          <TextArea
            rows={16}
            value={blob}
            onChange={(e) => setBlob(e.target.value)}
            placeholder="Paste the full job description here…"
            className={cx('font-mono text-[13px]')}
          />
          {pasteError && <p className="text-xs font-bold text-weak">{pasteError}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {pasteError && (
            <div className="border-[3px] border-border bg-yellow p-2.5 text-xs font-bold text-ink">
              {pasteError}
            </div>
          )}
          {duplicateOf && (
            <div className="border-[3px] border-border bg-yellow p-3 text-xs text-ink">
              <p className="font-bold">
                Looks like you already have this one — {duplicateOf.company} ·{' '}
                {duplicateOf.roleTitle}
                {duplicateOf.status ? ` (${STATUS_LABELS[duplicateOf.status]})` : ''}.
              </p>
              <p className="mt-1">
                Add it anyway if these are genuinely two different postings.
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setDuplicateOf(null);
                    void save(true);
                  }}
                >
                  Add anyway
                </Button>
                <Button variant="ghost" size="sm" onClick={close}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <JobFields value={draft} onChange={patch} />
        </div>
      )}
    </SlideOver>
  );
}
