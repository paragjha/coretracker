import Dexie, { type Table } from 'dexie';
import type { Job, Resume, ScreenshotBlob } from '../../types/types';

// Local-first store. Three tables:
//   jobs        — the sheet rows
//   resume      — single base resume (id 'base')
//   screenshots — original extraction images, kept forever
export class CoreTrackerDB extends Dexie {
  jobs!: Table<Job, string>;
  resume!: Table<Resume, string>;
  screenshots!: Table<ScreenshotBlob, string>;

  constructor() {
    super('coretracker');
    this.version(1).stores({
      // Indexed fields only; other properties are stored but not indexed.
      jobs: 'id, status, company, roleTitle, dateAdded, dateApplied, statusChangedAt, matchScore',
      resume: 'id',
      screenshots: 'ref',
    });
  }
}

export const db = new CoreTrackerDB();

export const RESUME_ID = 'base' as const;

/** Returns the base resume, or undefined if the user has not created one yet. */
export async function getResume(): Promise<Resume | undefined> {
  return db.resume.get(RESUME_ID);
}
