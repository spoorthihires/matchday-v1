import type { ImportSummary } from '../hooks/useImportPreview.js';

// Ported from matchday-admin-app_23.html lines 2242 (STEP 4: Import Summary). The prototype's own
// summaryResult() (lines ~4179-4184) renders a `.rev-card`/`.rev-row` ledger; the task brief for
// this step instead specifies `.kpis`/`.kpi` stat tiles (the same chrome valResult() already uses
// for its valid/invalid counts one step earlier), so this renders `preview.summary` as four tiles
// — Total rows / Duplicates excluded / Invalid excluded / Will import — rather than porting the
// review-card layout verbatim.

export interface StepSummaryProps {
  summary: ImportSummary | undefined;
}

export function StepSummary({ summary }: StepSummaryProps) {
  const total = summary?.total ?? 0;
  const duplicates = summary?.duplicates ?? 0;
  const invalid = summary?.invalid ?? 0;
  const willImport = summary?.willImport ?? 0;

  return (
    <section className="wstep active" data-panel="3">
      <div className="wh">
        <div className="eyebrow">Step 4</div>
        <h2>Import Summary</h2>
        <p>Review what will be imported. Duplicates and invalid rows are excluded automatically.</p>
      </div>
      <div className="kpis">
        <div className="kpi">
          <div className="kh"><span className="ic i-indigo"><i className="ti ti-table" /></span> Total rows</div>
          <div className="kv mono">{total}</div>
          <div className="kd flat">in file</div>
        </div>
        <div className="kpi">
          <div className="kh"><span className="ic i-amber"><i className="ti ti-copy" /></span> Duplicates excluded</div>
          <div className="kv mono">{duplicates}</div>
          <div className="kd flat">skipped</div>
        </div>
        <div className="kpi">
          <div className="kh"><span className="ic i-red"><i className="ti ti-alert-circle" /></span> Invalid excluded</div>
          <div className="kv mono">{invalid}</div>
          <div className="kd flat">skipped</div>
        </div>
        <div className="kpi">
          <div className="kh"><span className="ic i-green"><i className="ti ti-user-check" /></span> Will import</div>
          <div className="kv mono">{willImport}</div>
          <div className="kd flat">ready</div>
        </div>
      </div>
    </section>
  );
}
