import type { DriveInput } from '../../../types/drives.js';

export function validateStep(step: number, m: DriveInput): string[] {
  const errs: string[] = [];
  if (step === 0 && !m.name.trim()) errs.push('A drive name is required.');
  if (step === 1 && m.eventDates.length === 0) errs.push('Select at least one drive date.');
  if (step === 2) {
    if (m.eligibility.sources.length === 0) errs.push('Pick at least one source.');
    if (m.eligibility.branches.length === 0) errs.push('Pick at least one branch.');
  }
  if (step === 3 && !m.evaluation.some((e) => e.enabled)) errs.push('Enable at least one evaluation stage.');
  return errs;
}

export function isDriveValid(m: DriveInput): boolean {
  return [0, 1, 2, 3].every((s) => validateStep(s, m).length === 0);
}
