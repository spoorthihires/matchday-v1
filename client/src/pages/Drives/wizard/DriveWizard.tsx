import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../api/client.js';
import { useAuth } from '../../../auth/AuthContext.js';
import type { DriveInput } from '../../../types/drives.js';
import { useDriveMutations } from '../hooks/useDriveMutations.js';
import { StepBasics } from './StepBasics.js';
import { StepEligibility } from './StepEligibility.js';
import { StepEvaluation } from './StepEvaluation.js';
import { StepReview } from './StepReview.js';
import { StepSchedule } from './StepSchedule.js';
import { StepVisibility } from './StepVisibility.js';
import { validateStep } from './validation.js';

// Ported from matchday-admin-app_23.html lines ~2046-2208 (#wizard overlay: .wiz-top, .wiz-body
// with .wiz-rail/.wiz-main, .wiz-foot) plus the setStep/openWizard/validate/commit behavior around
// lines 2655-2777. The 6 step bodies (Task 7) are the real StepBasics/StepSchedule/
// StepEligibility/StepEvaluation/StepVisibility/StepReview components, rendered by the
// `renderStep` switch below; each per-field error is shown inline by the step component itself
// (from the `errors` prop), so this shell no longer needs a generic top-of-step error banner.

export interface DriveWizardProps {
  mode: 'create' | 'edit';
  driveId?: string;
  onClose: () => void;
}

const STEP_TITLES = ['Basic Info', 'Schedule', 'Eligibility', 'Evaluation', 'Visibility', 'Review & Publish'];
const STEP_CAPTIONS = [
  'Name, domain & mode',
  'Dates & capacity',
  'Who can apply',
  'Screening stages',
  'Access & registration',
  'Confirm & launch',
];
const TOTAL_STEPS = STEP_TITLES.length;

// The raw doc returned by GET /api/drives/:id (drives.controller's getController just
// `res.json`s the Mongoose document — see server/src/modules/drives/drives.controller.ts). It's a
// superset of DriveInput (_id + timestamps), with eventDates serialized to ISO strings by JSON.
interface DriveDocResponse extends DriveInput {
  _id: string;
  createdAt?: string;
  updatedAt?: string;
}

function mapDocToInput(doc: DriveDocResponse): DriveInput {
  return {
    name: doc.name, domain: doc.domain, stream: doc.stream, status: doc.status,
    candType: doc.candType, mode: doc.mode, frequency: doc.frequency, eventDay: doc.eventDay,
    eventDates: doc.eventDates, candCap: doc.candCap, empCap: doc.empCap, slotCap: doc.slotCap,
    eligibility: doc.eligibility, evaluation: doc.evaluation, visibility: doc.visibility,
  };
}

// Defaults mirror the prototype's openWizard() pre-selected options (matchday-admin-app_23.html
// line ~2685) and the review-step evaluation configs (lines 2152-2179).
export function blankDriveModel(): DriveInput {
  return {
    name: '',
    domain: 'Frontend',
    stream: 'B.Tech',
    status: 'Draft',
    candType: 'Freshers',
    mode: 'Hybrid',
    frequency: 'One-time',
    eventDay: 'Wednesday',
    eventDates: [],
    candCap: 500,
    empCap: 10,
    slotCap: 360,
    eligibility: {
      sources: ['Institutes'],
      branches: ['CSE', 'IT'],
      gradYears: [2025, 2026],
      expType: 'Freshers only',
    },
    evaluation: [
      { key: 'mcq', enabled: true, config: { questions: 30, durationMin: 30 } },
      { key: 'coding', enabled: true, config: { problems: 3, durationMin: 60 } },
      { key: 'tara', enabled: true, config: { durationMin: 20 } },
      { key: 'assignments', enabled: false, config: { deadlineDays: 3 } },
    ],
    visibility: {
      employerReg: 'Invite-only',
      instituteVis: 'Selected institutes',
      candidateAccess: 'Eligible only',
    },
  };
}

function renderStep(
  step: number,
  model: DriveInput,
  onChange: (patch: Partial<DriveInput>) => void,
  errors: string[],
) {
  switch (step) {
    case 0:
      return <StepBasics model={model} onChange={onChange} errors={errors} />;
    case 1:
      return <StepSchedule model={model} onChange={onChange} errors={errors} />;
    case 2:
      return <StepEligibility model={model} onChange={onChange} errors={errors} />;
    case 3:
      return <StepEvaluation model={model} onChange={onChange} errors={errors} />;
    case 4:
      return <StepVisibility model={model} onChange={onChange} errors={errors} />;
    case 5:
      return <StepReview model={model} onChange={onChange} errors={errors} />;
    default:
      return null;
  }
}

export function DriveWizard({ mode, driveId, onClose }: DriveWizardProps) {
  const { token } = useAuth();
  const { create, update } = useDriveMutations();
  const [step, setStep] = useState(0);
  const [model, setModel] = useState<DriveInput>(() => blankDriveModel());
  const [errors, setErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const driveQuery = useQuery({
    queryKey: ['drives', driveId],
    queryFn: () => apiFetch<DriveDocResponse>(`/drives/${driveId}`, { token }),
    enabled: mode === 'edit' && !!driveId && !!token,
  });

  // Prefill the model once the edit-mode fetch resolves. Only depends on the query's `data`
  // reference (stable once loaded, since the query isn't refetched while the wizard is open), so
  // this doesn't clobber in-progress user edits after the initial prefill.
  useEffect(() => {
    if (mode === 'edit' && driveQuery.data) setModel(mapDocToInput(driveQuery.data));
  }, [mode, driveQuery.data]);

  const editLoading = mode === 'edit' && driveQuery.isLoading;
  const editError = mode === 'edit' && driveQuery.isError;
  const isLast = step === TOTAL_STEPS - 1;
  const busy = create.isPending || update.isPending || editLoading;

  function onChange(patch: Partial<DriveInput>) {
    setModel((m) => ({ ...m, ...patch }));
    setErrors([]);
  }

  function goStep(target: number) {
    setStep(Math.max(0, Math.min(TOTAL_STEPS - 1, target)));
    setErrors([]);
  }

  // Stepper nav: free to go backward; forward requires the current step to validate first (and
  // only ever advances one step at a time), mirroring the prototype's #stepper click handler.
  function handleStepClick(target: number) {
    if (busy) return;
    if (target <= step) { goStep(target); return; }
    const errs = validateStep(step, model);
    if (errs.length) { setErrors(errs); return; }
    goStep(target === step + 1 ? target : step + 1);
  }

  function handleBack() {
    if (busy) return;
    goStep(step - 1);
  }

  function handleContinue() {
    if (busy) return;
    const errs = validateStep(step, model);
    if (errs.length) { setErrors(errs); return; }
    if (isLast) { submit('Published'); return; }
    goStep(step + 1);
  }

  function handleSaveDraft() {
    if (busy) return;
    submit('Draft');
  }

  function submit(status: string) {
    setSubmitError(null);
    const body: DriveInput = { ...model, status };
    const promise = mode === 'edit' && driveId
      ? update.mutateAsync({ id: driveId, body })
      : create.mutateAsync(body);
    promise.then(onClose).catch((err: unknown) => {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong while saving.');
    });
  }

  function handleClose() {
    if (window.confirm('Discard this drive? Unsaved changes will be lost. Use “Save draft & exit” to keep it.')) {
      onClose();
    }
  }

  return (
    <div id="wizard" className="show" role="dialog" aria-modal="true" aria-label={mode === 'edit' ? 'Edit Drive' : 'Create Drive'}>
      <div className="wiz-top">
        <span className="glyph"><i className="ti ti-calendar-plus" /></span>
        <div className="wt">
          {mode === 'edit' ? 'Edit MatchDay Drive' : 'Create MatchDay Drive'}
          <small>Configure and launch a recurring role-specific drive</small>
        </div>
        <div className="grow" />
        <button className="x" onClick={handleClose} aria-label="Close wizard"><i className="ti ti-x" /></button>
      </div>

      <div className="wiz-body">
        <aside className="wiz-rail">
          <div className="rlabel">Setup steps</div>
          <div className="stepper" id="stepper">
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

          {editLoading && <p className="fnote">Loading drive…</p>}
          {editError && <p style={{ color: 'var(--danger)' }}>Failed to load drive.</p>}

          {submitError && (
            <div className="wfld full err">
              <div className="emsg" style={{ display: 'flex' }}>
                <i className="ti ti-alert-circle" /> {submitError}
              </div>
            </div>
          )}

          {!editLoading && !editError && renderStep(step, model, onChange, errors)}
        </main>
      </div>

      <div className="wiz-foot">
        <button
          className="btn btn-ghost btn-lg"
          style={{ visibility: step === 0 ? 'hidden' : 'visible' }}
          onClick={handleBack}
          disabled={busy}
        >
          <i className="ti ti-arrow-left" /> Back
        </button>
        <span className="stepnum">Step {step + 1} of {TOTAL_STEPS}</span>
        <div className="grow" />
        <button className="btn btn-ghost btn-lg" onClick={handleSaveDraft} disabled={busy}>
          <i className="ti ti-device-floppy" /> Save draft &amp; exit
        </button>
        <button className="btn btn-primary btn-lg" onClick={handleContinue} disabled={busy}>
          {isLast ? <><i className="ti ti-cloud-upload" /> Publish drive</> : <>Continue <i className="ti ti-arrow-right" /></>}
        </button>
      </div>
    </div>
  );
}
