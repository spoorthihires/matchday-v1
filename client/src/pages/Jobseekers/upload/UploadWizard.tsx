import { useRef, useState } from 'react';
import { useImportCommit } from '../hooks/useImportCommit.js';
import { useImportPreview } from '../hooks/useImportPreview.js';
import { parseFile } from './parse.js';
import { SAMPLE_ROWS, type RawRow } from './template.js';
import { StepCompletion } from './StepCompletion.js';
import { StepDuplicates } from './StepDuplicates.js';
import { StepSummary } from './StepSummary.js';
import { StepUpload } from './StepUpload.js';
import { StepValidation } from './StepValidation.js';

// Ported from matchday-admin-app_23.html lines 2211-2252 (#upWizard overlay: .wiz-top/.glyph/.wt/
// .x, .wiz-body/.wiz-rail/.rlabel/.stepper with 5 .st items, .wiz-main/.wiz-progress/.pbar,
// .wiz-foot with Back/step-number/Continue) — same chrome classes as DriveWizard's #wizard
// (client/src/pages/Drives/wizard/DriveWizard.tsx), just a different id/glyph/title and a 5-step
// rail. theme.css already declares `#upWizard{position:fixed;...}` / `#upWizard.show{display:flex}`
// alongside the shared `.wiz-*`/`.st`/`.stepper` rules (ported for DriveWizard already).
//
// Task 7 built the SHELL: nav, the preview/commit mutation wiring, and per-step placeholders.
// Task 8 replaces each placeholder with the real step component (StepUpload/StepDuplicates/
// StepValidation/StepSummary/StepCompletion) and adds `onRemoveRow` (drop a row from the
// duplicates table and re-preview in place, without leaving the step).

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
  // Display label for the file chip only (StepUpload) — separate from `rows` because removing a
  // duplicate row (onRemoveRow) replaces `rows` in place without that being a new file/sample pick.
  const [fileName, setFileName] = useState<string | null>(null);
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
  // Once a commit has succeeded, step 4 shows its result and there's no further wiz-foot nav —
  // StepCompletion renders its own "Done" (-> onClose) alongside the report, since the shared
  // footer's Back/Continue buttons are hidden entirely below once `committed`.
  const committed = step === TOTAL_STEPS - 1 && !!commit.data;

  // Any new set of rows invalidates a stale preview (a fresh file/sample means the previously
  // computed duplicate/validation results no longer apply) — the next 0→1 advance re-runs it.
  function handleRowsChange(next: RawRow[]) {
    setRows(next);
    previewForRef.current = null; // invalidate any in-flight or completed preview
    preview.reset();
    setError(null);
  }

  // Shared by both file-input selection and drag/drop — parses the file, labels the chip with its
  // name, and (via handleRowsChange) invalidates any stale preview. Errors from a bad/corrupt file
  // surface as the shell's top-of-step error banner, same as before Task 8 split this out.
  async function processFile(file: File) {
    try {
      const parsed = await parseFile(file);
      setFileName(file.name);
      handleRowsChange(parsed);
    } catch (err) {
      setError(errMsg(err, 'Failed to parse file.'));
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (busy) return; // e.g. file dialog opened pre-preview, file picked while it's in flight
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processFile(file);
  }

  function handleFileDrop(file: File) {
    if (busy) return;
    void processFile(file);
  }

  function handleLoadSample() {
    if (busy) return;
    setFileName('sample-candidates.csv');
    handleRowsChange(SAMPLE_ROWS);
  }

  // StepDuplicates' per-row Remove: drop that row from `rows`, invalidate the stale preview (same
  // as any other rows change), then re-run the preview immediately against the trimmed array and
  // stay on this step — no navigation, so the refreshed duplicate/validation results just replace
  // what's on screen. Guarded by a stale-preview check (previewForRef) exactly like handleContinue's
  // step-0 preview kickoff, so a second removal fired before the first settles can't clobber it.
  function handleRemoveRow(index: number) {
    if (busy) return;
    const next = rows.filter((_, i) => i !== index);
    handleRowsChange(next);
    previewForRef.current = next;
    preview.mutateAsync(next).catch((err: unknown) => {
      if (previewForRef.current === next) setError(errMsg(err, 'Failed to preview the import.'));
    });
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

          {step === 0 && (
            <StepUpload
              rows={rows}
              fileName={fileName}
              busy={busy}
              fileInputRef={fileInputRef}
              onFileChange={handleFileChange}
              onFileDrop={handleFileDrop}
              onLoadSample={handleLoadSample}
            />
          )}
          {step === 1 && (
            <StepDuplicates preview={preview.data} busy={busy} onRemoveRow={handleRemoveRow} />
          )}
          {step === 2 && (
            <StepValidation preview={preview.data} />
          )}
          {step === 3 && (
            <StepSummary summary={preview.data?.summary} />
          )}
          {step === 4 && (
            <StepCompletion commit={commit.data} previewRows={preview.data?.rows ?? []} onClose={onClose} />
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
