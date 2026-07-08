import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import type { JobStatus } from '../../types/types';
import { STATUS_LABELS } from '../../types/types';

// ---------------------------------------------------------------------------
// Neubrutalist primitives (CoreTracker Design System v2.4):
// sharp corners, 2–3px ink borders, hard offset shadows, Space Grotesk 700.
// Interactive elements "press" — the shadow collapses and the element nudges
// toward it on hover/active. Every value resolves to a design token.
// ---------------------------------------------------------------------------

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

// The press: rest sits with a hard shadow; hover deepens it and lifts; active
// slams flat onto the shadow origin.
const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 border-[3px] border-border font-display font-bold ' +
  'transition-[transform,box-shadow] duration-100 disabled:opacity-50 disabled:pointer-events-none ' +
  'disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg ' +
  'shadow-[4px_4px_0_0_var(--ink)] hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[5px_5px_0_0_var(--ink)] ' +
  'active:translate-x-[3px] active:translate-y-[3px] active:shadow-none';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink',
  secondary: 'bg-surface text-ink',
  dark: 'bg-ink text-bg',
  ghost:
    'bg-transparent border-transparent shadow-none text-ink-2 hover:text-ink hover:bg-surface-2 ' +
    'hover:translate-x-0 hover:translate-y-0 hover:shadow-none active:translate-x-0 active:translate-y-0',
  danger: 'bg-danger text-white',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------

export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block font-mono text-[11px] font-bold uppercase tracking-wide text-ink-2">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-2">{hint}</span>}
    </label>
  );
}

const CONTROL =
  'w-full border-[3px] border-border bg-surface px-3 py-2 text-sm text-ink ' +
  'placeholder:text-ink-2/50 focus:outline-none focus:shadow-[3px_3px_0_0_var(--accent)] focus:-translate-x-[1px] focus:-translate-y-[1px] ' +
  'transition-[transform,box-shadow] duration-100';

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(CONTROL, 'resize-y', className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(CONTROL, 'cursor-pointer pr-8', className)} {...props}>
      {children}
    </select>
  );
}

// ---------------------------------------------------------------------------

// Solid status colors on ink-bordered pills — state never carried by color
// alone (a dot + label back it up).
const STATUS_STYLE: Record<JobStatus, string> = {
  to_apply: 'bg-surface text-ink',
  applied: 'bg-status-applied text-white',
  interviewing: 'bg-status-interviewing text-white',
  offer: 'bg-status-offer text-white',
  rejected: 'bg-status-rejected text-white',
  ghosted: 'bg-status-ghosted text-white',
};

const STATUS_DOT: Record<JobStatus, string> = {
  to_apply: 'bg-ink',
  applied: 'bg-white',
  interviewing: 'bg-white',
  offer: 'bg-white',
  rejected: 'bg-white',
  ghosted: 'bg-white',
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border-2 border-border px-2.5 py-0.5 text-xs font-bold',
        STATUS_STYLE[status],
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', STATUS_DOT[status])} />
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Filter pill. `active` fills tangerine; inactive is a plain ink-bordered pill. */
export function Chip({
  active,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border-2 border-border px-3 py-1 text-xs font-bold transition-colors',
        active ? 'bg-accent text-accent-ink' : 'bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// Segmented selector (design system's "Sheet View / Kanban View" control).
// One ink-bordered track; the active segment fills tangerine.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cx('inline-flex border-[3px] border-border bg-surface', className)}>
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cx(
            'px-3.5 py-1.5 text-xs font-bold transition-colors',
            i > 0 && 'border-l-[3px] border-border',
            value === opt.value ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export { cx };
