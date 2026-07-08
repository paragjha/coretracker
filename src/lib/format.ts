// Small formatting/date helpers shared across views.

export function todayISO(): string {
  return new Date().toISOString();
}

/** YYYY-MM-DD for <input type="date"> and compact display. */
export function toDateInput(iso?: string): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

/** Convert a YYYY-MM-DD input value back to an ISO string (midnight local). */
export function fromDateInput(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value + 'T00:00:00');
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Whole days between an ISO timestamp and now (>= 0). */
export function daysSince(iso?: string): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

export function uid(): string {
  return crypto.randomUUID();
}
