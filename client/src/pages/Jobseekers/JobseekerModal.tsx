import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.js';
import type { JobseekerDetail, JobseekerInput, JobseekerListItem } from '../../types/jobseekers.js';
import { CONSENT_OPTIONS, EVAL_LABEL_TO_VALUE, EVAL_OPTIONS, MR_ORDINAL, OFFER_OPTIONS, OFFER_TO_STAGE, STREAM_OPTIONS } from './constants.js';
import { useJobseekerMutations } from './hooks/useJobseekerMutations.js';

// Ported from matchday-admin-app_23.html lines 1694-1708 (#jsModal .modal-scrim/.modal) and the
// fillJsSelects()/openJsEditor()/jmSave handler around lines 4068-4084.
//
// Two deliberate deviations from the literal prototype markup, both because the real server
// schema (createJobseekerSchema/jobseekers.schemas.ts) needs more than the mock did:
//   1. Email + Grad year + CGPA fields are ADDED (not in the prototype's field list) — gradYear
//      (2020-2030) and cgpa (0-10) are required by the server on create, and email feeds the
//      server's dup-risk detection.
//   2. "Match readiness %" (#jmMatch) is a free-number input in the prototype; here it is
//      READ-ONLY, derived from the chosen offer/stage via the same ordinal map the server uses
//      (jobseekers.service.ts#MR_ORDINAL) — the real API has no independent match% field to edit,
//      it's always computed server-side from `stage`.
//
// Offer -> stage mapping (see task brief): on ADD, 'None' maps to stage 'Applied' and any other
// offer maps via OFFER_TO_STAGE. On EDIT, the offer select is prefilled from the row's current
// offerStatus; a `stage` patch is only sent if the user picked a *different* offer value, and
// 'None' on edit is never translated to a stage (there's no single "revert to non-offer stage"
// mapping — the server's OFFER_TO_STAGE 'None' case is a *set* of stages for filtering, not a
// single target stage to write back).

export interface JobseekerModalProps {
  mode: 'create' | 'edit';
  jobseeker?: JobseekerListItem;
  instituteOptions: { id: string; name: string }[];
  onClose: () => void;
}

interface FormState {
  name: string; instituteId: string; branch: string; evaluationStatus: 'na' | 'pending' | 'completed';
  offer: string; consent: 'Granted' | 'Pending' | 'Revoked'; email: string; gradYear: string; cgpa: string;
}

function blankForm(jobseeker: JobseekerListItem | undefined, instituteOptions: { id: string; name: string }[]): FormState {
  return {
    name: jobseeker?.name ?? '',
    instituteId: jobseeker?.instituteId ?? instituteOptions[0]?.id ?? '',
    branch: jobseeker?.stream ?? STREAM_OPTIONS[0],
    evaluationStatus: jobseeker ? (EVAL_LABEL_TO_VALUE[jobseeker.evaluationLabel] ?? 'na') : 'na',
    offer: jobseeker?.offerStatus ?? 'None',
    consent: jobseeker?.consent ?? 'Granted',
    email: jobseeker?.email ?? '',
    gradYear: '', cgpa: '', // filled from the GET /jobseekers/:id detail fetch below (edit) or left for the user to enter (create)
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type RequiredField = 'name' | 'instituteId' | 'branch' | 'gradYear' | 'cgpa' | 'email';

// Which stage the currently-selected offer resolves to, for the read-only match% preview and for
// the ADD-mode save payload.
function resolveStage(offer: string, mode: 'create' | 'edit', currentStage: string | undefined): string {
  if (offer !== 'None') return OFFER_TO_STAGE[offer] ?? 'Applied';
  return mode === 'edit' ? (currentStage ?? 'Applied') : 'Applied';
}

export function JobseekerModal({ mode, jobseeker, instituteOptions, onClose }: JobseekerModalProps) {
  const { token } = useAuth();
  const { add, update } = useJobseekerMutations();
  const [form, setForm] = useState<FormState>(() => blankForm(jobseeker, instituteOptions));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RequiredField, boolean>>>({});
  const [error, setError] = useState<string | null>(null);
  // Captured once at open — the baseline to compare the offer select against on save (edit only).
  const [initialOffer] = useState(jobseeker?.offerStatus ?? 'None');

  // The list item doesn't carry gradYear/cgpa (or the raw `stage`), so fetch the full doc for
  // prefill when editing.
  const { data: detail, isLoading: detailLoading, isError: detailError } = useQuery({
    queryKey: ['jobseeker', jobseeker?.id],
    queryFn: () => apiFetch<JobseekerDetail>(`/jobseekers/${jobseeker!.id}`, { token }),
    enabled: mode === 'edit' && !!jobseeker?.id && !!token,
  });

  useEffect(() => {
    if (detail) {
      setForm((f) => ({ ...f, gradYear: String(detail.gradYear), cgpa: String(detail.cgpa) }));
    }
  }, [detail]);

  // Default the institute select once options load, if a create-mode form hasn't picked one yet.
  // Intentionally depends on `instituteOptions` only — `mode`/`form.instituteId` are read for the
  // guard, not to re-arm on every keystroke.
  useEffect(() => {
    if (mode === 'create' && !form.instituteId && instituteOptions.length > 0) {
      setForm((f) => ({ ...f, instituteId: instituteOptions[0].id }));
    }
  }, [instituteOptions]);

  const pending = add.isPending || update.isPending;
  const waitingOnDetail = mode === 'edit' && detailLoading;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): { name: string; instituteId: string; branch: string; gradYear: number; cgpa: number; email: string } | null {
    const name = form.name.trim();
    const email = form.email.trim();
    const gradYear = Number(form.gradYear);
    const cgpa = Number(form.cgpa);
    const errors: Partial<Record<RequiredField, boolean>> = {
      name: !name,
      instituteId: !form.instituteId,
      branch: !form.branch,
      gradYear: !Number.isFinite(gradYear) || gradYear < 2020 || gradYear > 2030,
      cgpa: !Number.isFinite(cgpa) || cgpa < 0 || cgpa > 10,
      email: email !== '' && !EMAIL_RE.test(email),
    };
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      setError('Please fill in all required fields with valid values.');
      return null;
    }
    setError(null);
    return { name, instituteId: form.instituteId, branch: form.branch, gradYear, cgpa, email };
  }

  async function handleSave() {
    const valid = validate();
    if (!valid) return;

    const body: JobseekerInput = {
      name: valid.name, instituteId: valid.instituteId, branch: valid.branch,
      gradYear: valid.gradYear, cgpa: valid.cgpa,
      email: valid.email || undefined,
      consent: form.consent,
      evaluationStatus: form.evaluationStatus,
    };
    if (mode === 'create') {
      body.stage = resolveStage(form.offer, 'create', undefined);
    } else if (form.offer !== initialOffer && form.offer !== 'None') {
      body.stage = OFFER_TO_STAGE[form.offer];
    }

    try {
      if (mode === 'edit' && jobseeker) {
        await update.mutateAsync({ id: jobseeker.id, body });
      } else {
        await add.mutateAsync(body);
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.code === 'validation' ? `${err.message} — please check the required fields.` : err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    }
  }

  const previewPct = MR_ORDINAL[resolveStage(form.offer, mode, detail?.stage ?? jobseeker?.stage)] ?? 0;

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="jmTitle">
        <div className="modal-h">
          <div>
            <h3 id="jmTitle">{mode === 'edit' ? 'Edit Candidate' : 'Add Candidate'}</h3>
            <p>Register a jobseeker into the MatchDay pipeline.</p>
          </div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-b">
          {error && (
            <div className="fld full" style={{ color: 'var(--danger)', fontSize: 12.5 }}>{error}</div>
          )}
          {mode === 'edit' && detailError && (
            <div className="fld full" style={{ color: 'var(--danger)', fontSize: 12.5 }}>
              Couldn&apos;t load this candidate&apos;s grad year / CGPA — please re-enter them before saving.
            </div>
          )}
          <div className="fld full">
            <label htmlFor="jmName">Full name</label>
            <input
              id="jmName"
              placeholder="e.g. Aarav Sharma"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              style={fieldErrors.name ? { borderColor: 'var(--danger)' } : undefined}
            />
          </div>
          <div className="fld">
            <label htmlFor="jmInst">Institute</label>
            <select
              id="jmInst"
              value={form.instituteId}
              onChange={(e) => set('instituteId', e.target.value)}
              style={fieldErrors.instituteId ? { borderColor: 'var(--danger)' } : undefined}
            >
              {instituteOptions.length === 0 && <option value="">No institutes available</option>}
              {instituteOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="jmStream">Stream</label>
            <select id="jmStream" value={form.branch} onChange={(e) => set('branch', e.target.value)}>
              {STREAM_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="jmEval">Evaluation status</label>
            <select id="jmEval" value={form.evaluationStatus} onChange={(e) => set('evaluationStatus', e.target.value as FormState['evaluationStatus'])}>
              {EVAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="jmMatch">Match readiness %</label>
            <input id="jmMatch" value={`${previewPct}%`} readOnly disabled />
            <span className="fnote">Derived automatically from offer status</span>
          </div>
          <div className="fld">
            <label htmlFor="jmOffer">Offer status</label>
            <select id="jmOffer" value={form.offer} onChange={(e) => set('offer', e.target.value)}>
              {OFFER_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="jmConsent">Consent</label>
            <select id="jmConsent" value={form.consent} onChange={(e) => set('consent', e.target.value as FormState['consent'])}>
              {CONSENT_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="jmEmail">Email</label>
            <input
              id="jmEmail"
              type="email"
              placeholder="name@institute.edu"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              style={fieldErrors.email ? { borderColor: 'var(--danger)' } : undefined}
            />
          </div>
          <div className="fld">
            <label htmlFor="jmGradYear">Grad year</label>
            <input
              id="jmGradYear"
              type="number"
              min={2020}
              max={2030}
              value={form.gradYear}
              onChange={(e) => set('gradYear', e.target.value)}
              style={fieldErrors.gradYear ? { borderColor: 'var(--danger)' } : undefined}
              disabled={waitingOnDetail}
            />
          </div>
          <div className="fld">
            <label htmlFor="jmCgpa">CGPA</label>
            <input
              id="jmCgpa"
              type="number"
              min={0}
              max={10}
              step="0.01"
              value={form.cgpa}
              onChange={(e) => set('cgpa', e.target.value)}
              style={fieldErrors.cgpa ? { borderColor: 'var(--danger)' } : undefined}
              disabled={waitingOnDetail}
            />
          </div>
        </div>
        <div className="modal-f">
          <div className="grow" />
          <button className="btn btn-ghost btn-lg" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" disabled={pending || waitingOnDetail} onClick={handleSave}>
            <i className="ti ti-device-floppy" /> {pending ? 'Saving…' : 'Save candidate'}
          </button>
        </div>
      </div>
    </div>
  );
}
