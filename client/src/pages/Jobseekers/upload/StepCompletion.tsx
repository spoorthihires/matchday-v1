import type { ImportCommitResponse } from '../hooks/useImportCommit.js';
import type { ImportRowResult } from '../hooks/useImportPreview.js';

// Ported from matchday-admin-app_23.html lines 2243 (STEP 5: Completion Report) plus doImport()
// (lines ~4189-4193): `.bigtick` success mark + `.kpis` stat tiles + a downloadable report. The
// prototype rebuilds its report from the same in-memory `upBatch` used throughout the wizard;
// here the equivalent source is the LAST successful preview's rows (`previewRows`, passed down as
// `preview.data.rows` from the shell) — commit's own response only carries aggregate counts, not
// per-row outcomes, so the per-row CSV log is derived from preview rows with each outcome inferred
// the same way the server's summarize() derives its counts (valid && !dupe -> imported; dupe ->
// duplicate; !valid -> invalid). A "Done" button lives here (not the shared wiz-foot) because the
// shell intentionally hides its own footer Continue button once committed (see UploadWizard.tsx).

export interface StepCompletionProps {
  commit: ImportCommitResponse | undefined;
  previewRows: ImportRowResult[];
  onClose: () => void;
}

type Outcome = 'imported' | 'duplicate' | 'invalid';

function outcomeOf(r: ImportRowResult): Outcome {
  if (!r.valid) return 'invalid';
  if (r.dupe) return 'duplicate';
  return 'imported';
}

function reasonOf(r: ImportRowResult): string {
  if (!r.valid) return r.errors.join('; ');
  if (r.dupe) return r.dupeReason ?? '';
  return '';
}

function buildResultLog(rows: ImportRowResult[]): string {
  const header = 'index,name,email,outcome,reason';
  const lines = rows.map((r) => `${r.index},"${r.data.name}","${r.data.email}",${outcomeOf(r)},"${reasonOf(r)}"`);
  return [header, ...lines].join('\n');
}

function downloadResultLog(rows: ImportRowResult[]) {
  const url = URL.createObjectURL(new Blob([buildResultLog(rows)], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'import-result-log.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function StepCompletion({ commit, previewRows, onClose }: StepCompletionProps) {
  const imported = commit?.imported ?? 0;
  const skipped = commit?.skipped ?? 0;
  const dupSkipped = commit?.skippedReasons.duplicates ?? 0;
  const invalidSkipped = commit?.skippedReasons.invalid ?? 0;

  return (
    <section className="wstep active" data-panel="4">
      <div className="wh">
        <div className="eyebrow">Step 5</div>
        <h2>Completion Report</h2>
        <p>Your import is complete.</p>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div className="bigtick"><i className="ti ti-check" /></div>
        <h3 style={{ fontSize: 18, fontWeight: 700 }}>Import complete</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '4px 0 0' }}>
          {imported} jobseeker{imported === 1 ? '' : 's'} added to the MatchDay pipeline.
        </p>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="kh"><span className="ic i-green"><i className="ti ti-user-plus" /></span> Imported</div>
          <div className="kv mono">{imported}</div>
          <div className="kd flat">added</div>
        </div>
        <div className="kpi">
          <div className="kh"><span className="ic i-amber"><i className="ti ti-ban" /></span> Skipped</div>
          <div className="kv mono">{skipped}</div>
          <div className="kd flat">total</div>
        </div>
        <div className="kpi">
          <div className="kh"><span className="ic i-amber"><i className="ti ti-copy" /></span> Duplicates skipped</div>
          <div className="kv mono">{dupSkipped}</div>
          <div className="kd flat">matched</div>
        </div>
        <div className="kpi">
          <div className="kh"><span className="ic i-red"><i className="ti ti-alert-circle" /></span> Invalid excluded</div>
          <div className="kv mono">{invalidSkipped}</div>
          <div className="kd flat">in error report</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={() => downloadResultLog(previewRows)}>
          <i className="ti ti-download" /> Download result log
        </button>
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </section>
  );
}
