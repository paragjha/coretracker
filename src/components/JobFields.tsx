import type { ExtractionResult, WorkMode } from '../types/types';
import { Field, Select, TextArea, TextInput } from './ui/primitives';
import { toDateInput, fromDateInput } from '../lib/format';

// Editable subset of a Job, shared by the add form and the detail panel.
export interface JobDraft {
  company: string;
  roleTitle: string;
  jdText: string;
  salaryBand?: string;
  location?: string;
  workMode?: WorkMode;
  contactEmail?: string;
  contactName?: string;
  applyUrl?: string;
  skillsRequired: string[];
  experienceRequired?: string;
  dateApplied?: string;
  notes: string;
}

const WORK_MODES: WorkMode[] = ['unknown', 'remote', 'hybrid', 'onsite'];

export function emptyDraft(): JobDraft {
  return { company: '', roleTitle: '', jdText: '', skillsRequired: [], notes: '' };
}

/** Maps an AI extraction result onto an editable draft (shared by paste + screenshot flows). */
export function draftFromExtraction(r: ExtractionResult, notes = ''): JobDraft {
  return {
    company: r.company ?? '',
    roleTitle: r.roleTitle ?? '',
    jdText: r.jdText,
    salaryBand: r.salaryBand ?? undefined,
    location: r.location ?? undefined,
    workMode: r.workMode,
    contactEmail: r.contactEmail ?? undefined,
    contactName: r.contactName ?? undefined,
    applyUrl: r.applyUrl ?? undefined,
    skillsRequired: r.skillsRequired,
    experienceRequired: r.experienceRequired ?? undefined,
    notes,
  };
}

export function JobFields({
  value,
  onChange,
  showDateApplied = false,
}: {
  value: JobDraft;
  onChange: (patch: Partial<JobDraft>) => void;
  showDateApplied?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Company">
          <TextInput
            value={value.company}
            onChange={(e) => onChange({ company: e.target.value })}
            placeholder="Acme Inc."
          />
        </Field>
        <Field label="Role title">
          <TextInput
            value={value.roleTitle}
            onChange={(e) => onChange({ roleTitle: e.target.value })}
            placeholder="Product Designer"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Location">
          <TextInput
            value={value.location ?? ''}
            onChange={(e) => onChange({ location: e.target.value || undefined })}
            placeholder="Bengaluru"
          />
        </Field>
        <Field label="Work mode">
          <Select
            value={value.workMode ?? 'unknown'}
            onChange={(e) => onChange({ workMode: e.target.value as WorkMode })}
          >
            {WORK_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Salary band">
          <TextInput
            value={value.salaryBand ?? ''}
            onChange={(e) => onChange({ salaryBand: e.target.value || undefined })}
            placeholder="9-12 LPA"
          />
        </Field>
        <Field label="Experience required">
          <TextInput
            value={value.experienceRequired ?? ''}
            onChange={(e) => onChange({ experienceRequired: e.target.value || undefined })}
            placeholder="2-4 years"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact name">
          <TextInput
            value={value.contactName ?? ''}
            onChange={(e) => onChange({ contactName: e.target.value || undefined })}
          />
        </Field>
        <Field label="Contact email">
          <TextInput
            type="email"
            value={value.contactEmail ?? ''}
            onChange={(e) => onChange({ contactEmail: e.target.value || undefined })}
          />
        </Field>
      </div>

      <div className={showDateApplied ? 'grid grid-cols-2 gap-3' : ''}>
        <Field label="Apply URL">
          <TextInput
            value={value.applyUrl ?? ''}
            onChange={(e) => onChange({ applyUrl: e.target.value || undefined })}
            placeholder="https://…"
          />
        </Field>
        {showDateApplied && (
          <Field label="Date applied">
            <TextInput
              type="date"
              value={toDateInput(value.dateApplied)}
              onChange={(e) => onChange({ dateApplied: fromDateInput(e.target.value) })}
            />
          </Field>
        )}
      </div>

      <Field label="Skills required" hint="Comma-separated.">
        <TextInput
          value={value.skillsRequired.join(', ')}
          onChange={(e) =>
            onChange({
              skillsRequired: e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="Figma, prototyping, design systems"
        />
      </Field>

      <Field label="Job description">
        <TextArea
          rows={8}
          value={value.jdText}
          onChange={(e) => onChange({ jdText: e.target.value })}
          placeholder="Paste the full JD here…"
        />
      </Field>

      <Field label="Notes">
        <TextArea
          rows={3}
          value={value.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </Field>
    </div>
  );
}
