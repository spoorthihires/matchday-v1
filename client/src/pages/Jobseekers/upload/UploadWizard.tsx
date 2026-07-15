import { useRef, useState } from 'react';
import { useImportCommit } from '../hooks/useImportCommit.js';
import { useImportPreview } from '../hooks/useImportPreview.js';
import { parseFile } from './parse.js';
import { SAMPLE_ROWS, type RawRow } from './template.js';

// Ported from matchday-admin-app_23.html lines 2211-2252 (#upWizard overlay: .wiz-top/.glyph/.wt/
// .x, .wiz-body/.wiz-rail/.rlabel/.stepper with 5 .st items, .wiz-main/.wiz-progress/.pbar,
// .wiz-foot with Back/step-number/Continue) — same chrome classes as DriveWizard's #wizard
// (client/src/pages/Drives/wizard/DriveWizard.tsx), just a different id/glyph/title and a 5-step
// rail. theme.css already declares `#upWizard{position:fixed;...}` / `#upWizard.show{display:flex}`
// alongside the shared `.wiz-*`/`.st`/`.stepper` rules (ported for DriveWizard already).
//
// This task (7) builds the SHELL only: nav, the preview/commit mutation wiring, and per-step
// PLACEHOLDERS. Task 8 replaces each `renderStep` case with the real step component (dropzone +
// file chip, duplicate table, validation table, import summary, completion report) — see the
// `// TODO(Task 8)` markers below for exactly where those plug in.

export interface UploadWizardProps {
  onClose: () => void;
}

const STEP_TITLES = ['CSV Upload', 'Duplicate Check', 'Validation', 'Import Summary', 'Completion Report'];
const STEP_CAPTIONS = ['Choose a file', 'Detected matches', 'Field checks', 'Review & confirm', 'Results & download'];
const TOTAL_STEPS = STEP_TITLES.length;

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function UploadWizard({ onClose }: UploadWizardProps) {
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Which `rows` array the in-flight/completed preview was requested for. Compared by REFERENCE —
  // `rows` state is replaced wholesale on every change, so reference equality is a correct
  // staleness check; null = no valid or in-flight preview. Guards a stale-preview race: apiFetch
  // has no cancellation, so if rows change while a preview is in flight the old promise still
  // settles — its completion must be ignored rather than advance the wizard, and `preview.data`
  // alone can't be trusted (a stale mutation settling after preview.reset() re-populates it).
  const previewForRef = useRef<RawRow[] | null>(null);

  const preview = useImportPreview();
  const commit = useImportCommit();
  const busy = preview.isPending || commit.isPending;
  // Once a commit has succeeded, step 4 shows its result and there's no further nav — closing
  // (X) is the only exit until Task 8 adds a "Done" action.
  const committed = step === TOTAL_STEPS - 1 && !!commit.data;

  // Any new set of rows invalidates a stale preview (a fresh file/sample means the previously
  // computed duplicate/validation results no longer apply) — the next 0→1 advance re-runs it.
  function handleRowsChange(next: RawRow[]) {
    setRows(next);
    previewForRef.current = null; // invalidate any in-flight or completed preview
    preview.reset();
    setError(null);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (busy) return; // e.g. file dialog opened pre-preview, file picked while it's in flight
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      handleRowsChange(await parseFile(file));
    } catch (err) {
      setError(errMsg(err, 'Failed to parse file.'));
    }
  }

  function handleLoadSample() {
    if (busy) return;
    handleRowsChange(SAMPLE_ROWS);
  }

  function goStep(target: number) {
    setStep(Math.max(0, Math.min(TOTAL_STEPS - 1, target)));
    setError(null);
  }

  function handleContinue() {
    if (busy) return;
    setError(null);
    if (step === 0) {
      if (rows.length === 0) { setError('Add at least one row before continuing.'); return; }
      // Reuse the preview only if it was requested for THIS rows reference — preview.data alone
      // may be stale (see previewForRef above).
      if (preview.data && previewForRef.current === rows) { goStep(1); return; }
      previewForRef.current = rows;
      preview.mutateAsync(rows).then(() => {
        if (previewForRef.current === rows) goStep(1); // ignore stale completion (rows changed mid-flight)
      }).catch((err: unknown) => {
        if (previewForRef.current === rows) setError(errMsg(err, 'Failed to preview the import.'));
      });
      return;
    }
    if (step === TOTAL_STEPS - 2) {
      commit.mutateAsync(rows).then(() => goStep(TOTAL_STEPS - 1)).catch((err: unknown) => {
        setError(errMsg(err, 'Failed to commit the import.'));
      });
      return;
    }
    if (step < TOTAL_STEPS - 1) goStep(step + 1);
  }

  function handleBack() {
    if (busy || committed) return;
    goStep(step - 1);
  }

  // Rail nav: free to go backward (unless locked post-commit); forward only one step at a time,
  // reusing handleContinue's gating/mutation logic so a rail click can't skip the preview/commit
  // side effects — mirrors DriveWizard's handleStepClick (client/src/pages/Drives/wizard/DriveWizard.tsx).
  function handleStepClick(target: number) {
    if (busy || committed) return;
    if (target <= step) { goStep(target); return; }
    if (target === step + 1) handleContinue();
  }

  const willImport = preview.data?.summary.willImport ?? 0;

  return (
    <div id="upWizard" className="show" role="dialog" aria-modal="true" aria-label="Bulk candidate upload">
      <div className="wiz-top">
        <span className="glyph"><i className="ti ti-users-plus" /></span>
        <div className="wt">
          Bulk Candidate Upload
          <small>Import candidates with duplicate &amp; validation checks</small>
        </div>
        <div className="grow" />
        <button className="x" onClick={onClose} aria-label="Close"><i className="ti ti-x" /></button>
      </div>

      <div className="wiz-body">
        <aside className="wiz-rail">
          <div className="rlabel">Upload pipeline</div>
          <div className="stepper">
            {STEP_TITLES.map((title, i) => (
              <div
                key={title}
                className={`st${i === step ? ' current' : ''}${i < step ? ' done' : ''}`}
                data-step={i}
                onClick={() => handleStepClick(i)}
              >
                <div className="dot">{i + 1}</div>
                <div className="si">
                  <b>{title}</b>
                  <span>{STEP_CAPTIONS[i]}</span>
                  <span className="stmark">Done</span>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className="wiz-main">
          <div className="wiz-progress">
            <div className="plabel">
              <span>{STEP_TITLES[step]}</span>
              <span>Step {step + 1} of {TOTAL_STEPS}</span>
            </div>
            <div className="pbar"><i style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }} /></div>
          </div>

          {error && (
            <div className="wfld full err">
              <div className="emsg" style={{ display: 'flex' }}>
                <i className="ti ti-alert-circle" /> {error}
              </div>
            </div>
          )}

          {/* TODO(Task 8): render real step component for each case below (dropzone + file chip
              for step 0, duplicate table for step 1, validation table for step 2, import summary
              for step 3, completion report for step 4) instead of these placeholders. */}
          {step === 0 && (
            <div className="wstep active">
              Step 1 — CSV Upload
              <div style={{ marginTop: 12 }}>
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} disabled={busy} />
              </div>
              <div style={{ marginTop: 8 }}>
                <button className="btn btn-ghost" onClick={handleLoadSample} disabled={busy}>Use a sample dataset</button>
              </div>
              {rows.length > 0 && <p className="fnote">{rows.length} row(s) loaded.</p>}
            </div>
          )}
          {step === 1 && (
            <div className="wstep active">
              Step 2 — Duplicate Check
              {preview.data && (
                <p className="fnote">{preview.data.summary.duplicates} duplicate row(s) found out of {preview.data.summary.total}.</p>
              )}
            </div>
          )}
          {step === 2 && (
            <div className="wstep active">
              Step 3 — Validation
              {preview.data && (
                <p className="fnote">{preview.data.summary.invalid} invalid row(s) out of {preview.data.summary.total}.</p>
              )}
            </div>
          )}
          {step === 3 && (
            <div className="wstep active">
              Step 4 — Import Summary
              {preview.data && (
                <p className="fnote">{willImport} of {preview.data.summary.total} row(s) will be imported.</p>
              )}
            </div>
          )}
          {step === 4 && (
            <div className="wstep active">
              Step 5 — Completion Report
              {commit.data && (
                <p className="fnote">
                  Imported {commit.data.imported}, skipped {commit.data.skipped}
                  {' '}({commit.data.skippedReasons.duplicates} duplicate(s), {commit.data.skippedReasons.invalid} invalid).
                </p>
              )}
            </div>
          )}
        </main>
      </div>

      <div className="wiz-foot">
        <button
          className="btn btn-ghost btn-lg"
          style={{ visibility: step === 0 || committed ? 'hidden' : 'visible' }}
          onClick={handleBack}
          disabled={busy}
        >
          <i className="ti ti-arrow-left" /> Back
        </button>
        <span className="stepnum">Step {step + 1} of {TOTAL_STEPS}</span>
        <div className="grow" />
        {!committed && (
          <button
            className="btn btn-primary btn-lg"
            onClick={handleContinue}
            disabled={busy || (step === 0 && rows.length === 0)}
          >
            {step === TOTAL_STEPS - 2
              ? <>{commit.isPending ? 'Importing…' : `Import ${willImport} candidates`} <i className="ti ti-cloud-upload" /></>
              : <>{preview.isPending ? 'Checking…' : 'Continue'} <i className="ti ti-arrow-right" /></>}
          </button>
        )}
      </div>
    </div>
  );
}
