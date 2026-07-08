import type { Job } from '../types/types';
import { STATUS_LABELS } from '../types/types';
import { toDateInput } from './format';

// CSV export of the whole sheet — insurance against IndexedDB loss and handy
// for sharing. Opens cleanly in Sheets/Excel.

const COLUMNS: { header: string; value: (j: Job) => string }[] = [
  { header: 'Company', value: (j) => j.company },
  { header: 'Role', value: (j) => j.roleTitle },
  { header: 'Status', value: (j) => STATUS_LABELS[j.status] },
  { header: 'Match Score', value: (j) => (j.matchScore != null ? String(j.matchScore) : '') },
  { header: 'Date Added', value: (j) => toDateInput(j.dateAdded) },
  { header: 'Date Applied', value: (j) => toDateInput(j.dateApplied) },
  { header: 'Location', value: (j) => j.location ?? '' },
  { header: 'Work Mode', value: (j) => j.workMode ?? '' },
  { header: 'Salary', value: (j) => j.salaryBand ?? '' },
  { header: 'Experience', value: (j) => j.experienceRequired ?? '' },
  { header: 'Skills', value: (j) => j.skillsRequired.join('; ') },
  { header: 'Contact Name', value: (j) => j.contactName ?? '' },
  { header: 'Contact Email', value: (j) => j.contactEmail ?? '' },
  { header: 'Apply URL', value: (j) => j.applyUrl ?? '' },
  { header: 'Notes', value: (j) => j.notes },
];

function escapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function jobsToCsv(jobs: Job[]): string {
  const rows = [COLUMNS.map((c) => c.header)];
  for (const job of jobs) {
    rows.push(COLUMNS.map((c) => c.value(job)));
  }
  return rows.map((r) => r.map(escapeCell).join(',')).join('\r\n');
}

export function downloadCsv(jobs: Job[]): void {
  const csv = jobsToCsv(jobs);
  // BOM so Excel detects UTF-8.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `coretracker-${toDateInput(new Date().toISOString())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
