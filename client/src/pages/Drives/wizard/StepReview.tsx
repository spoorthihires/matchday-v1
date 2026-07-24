import type { ReactNode } from 'react';
import type { EvaluationStage } from '../../../types/drives.js';
import { fmtMonth } from './dateUtils.js';
import { isDriveValid, validateStep } from './validation.js';
import type { WizardStepProps } from './types.js';

// Ported from matchday-admin-app_23.html lines 2193-2197 (STEP 6: Review & Publish) — the
// prototype builds `#reviewBody`/`#revWarn` via renderReview() (lines 2735-2756). The card
// layout is ported the same way; the "missing" warning is driven directly by
// validateStep/isDriveValid (steps 0-3) instead of a hand-rolled duplicate list, so it can
// never drift from the wizard's own Continue-gating rules.

const EVAL_LABELS: Record<EvaluationStage['key'], string> = {
  mcq: 'MCQ',
  coding: 'Coding',
  tara: 'TARA',
  assignments: 'Assignments',
};

function list(items: string[]): string {
  return items.length ? items.join(', ') : '—';
}

function row(k: string, v: string): ReactNode {
  return (
    <div className="rev-row" key={k}>
      <span className="k">{k}</span>
      <span className="v">{v || '—'}</span>
    </div>
  );
}

export function StepReview({ model }: WizardStepProps) {
  const valid = isDriveValid(model);
  const warnings = valid ? [] : [0, 1, 2, 3].flatMap((s) => validateStep(s, model));
  const evOn = model.evaluation.filter((e) => e.enabled).map((e) => EVAL_LABELS[e.key]);
  const monthLabel = model.eventDates.length ? fmtMonth(new Date(model.eventDates[0])) : '—';

  return (
    <section className="wstep active" data-panel="5">
      <div className="wh">
        <div className="eyebrow">Step 6</div>
        <h2>Review &amp; Publish</h2>
        <p>Confirm the configuration below, then publish the drive or keep it as a draft.</p>
      </div>
      <div id="revWarn">
        {warnings.length > 0 && (
          <div className="rev-warn">
            <i className="ti ti-alert-triangle" /> {warnings.join(' ')} You can still save a draft, but publishing
            needs these.
          </div>
        )}
      </div>
      <div className="rev-grid" id="reviewBody">
        <div className="rev-card">
          <div className="rc-h">
            <b>Basic info</b>
          </div>
          {row('Name', model.name)}
          {row('Domain', model.domain)}
          {row('Stream', model.stream)}
          {row('Jobseeker type', model.candType)}
          {row('Mode', model.mode)}
        </div>
        <div className="rev-card">
          <div className="rc-h">
            <b>Schedule</b>
          </div>
          {row('Frequency', model.frequency)}
          {row('Event day', model.eventDay)}
          {row('Month', monthLabel)}
          {row('Dates', `${model.eventDates.length} selected`)}
          {row('Capacity', `C ${model.candCap} · E ${model.empCap} · Slots ${model.slotCap}`)}
        </div>
        <div className="rev-card">
          <div className="rc-h">
            <b>Eligibility</b>
          </div>
          {row('Sources', list(model.eligibility.sources))}
          {row('Branches', list(model.eligibility.branches))}
          {row('Grad years', list(model.eligibility.gradYears.map(String)))}
          {row('Experience', model.eligibility.expType)}
        </div>
        <div className="rev-card">
          <div className="rc-h">
            <b>Evaluation</b>
          </div>
          {row('Stages', list(evOn))}
        </div>
        <div className="rev-card full">
          <div className="rc-h">
            <b>Visibility</b>
          </div>
          {row('Employer registration', model.visibility.employerReg)}
          {row('Institute visibility', model.visibility.instituteVis)}
          {row('Jobseeker access', model.visibility.candidateAccess)}
        </div>
      </div>
    </section>
  );
}
