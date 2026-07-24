import { type KeyboardEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client.js';
import type { CreateRegistrationResult, RegistrationInput } from '../../types/employer.js';
import { useEmployerDrive } from './hooks/useEmployerDrives.js';
import { useCreateRegistration } from './hooks/useEmployerRegistrations.js';
import './employerBase.js';

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const STEP_LABELS: Record<Step, string> = {
  1: 'Role information', 2: 'Eligibility', 3: 'Compensation',
  4: 'Location', 5: 'Schedule', 6: 'Evaluation', 7: 'Review & submit',
};

const URGENCY_OPTIONS = ['Immediate', 'Within 2 weeks', 'Within a month', 'Flexible'];
const QUALIFICATIONS = ['B.Tech / B.E.', 'B.Sc / BCA', 'M.Tech / M.E.', 'M.Sc / MCA', 'MBA', 'Any graduate'];
const WORK_MODES = ['On-site', 'Hybrid', 'Remote'];
const TIME_SLOTS = ['10 AM – 12 PM', '12 – 2 PM', '2 – 4 PM'];

interface StepErrors {
  role?: boolean;
  openings?: boolean;
  ctcMin?: boolean;
  ctcMax?: boolean;
}

function TogglePills({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="toggle-row">
      {options.map((v) => (
        <button
          key={v}
          type="button"
          className={`toggle-pill ${value === v ? 'on' : ''}`}
          onClick={() => onChange(value === v ? '' : v)}
        >
          <span className="tk"><svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg></span>{v}
        </button>
      ))}
    </div>
  );
}

function ChipField({
  label, values, onChange, placeholder, ariaLabel, hint, required, showErr, errMsg,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  ariaLabel: string;
  hint?: string;
  required?: boolean;
  showErr?: boolean;
  errMsg?: string;
}) {
  const [input, setInput] = useState('');

  function add() {
    const v = input.trim().replace(/,$/, '');
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setInput('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && !input && values.length) {
      onChange(values.slice(0, -1));
    }
  }

  function remove(i: number) {
    onChange(values.filter((_, idx) => idx !== i));
  }

  return (
    <div className={`field full${showErr ? ' show-err' : ''}`}>
      <label>{label} {required ? <span className="req">*</span> : <span className="opt">(optional)</span>}</label>
      <div className="chips-input">
        {values.map((v, i) => (
          <span className="chip" key={v}>
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => remove(i)}>
              <svg className="ic ic-sm" viewBox="0 0 24 24" style={{ width: 13, height: 13 }}><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </span>
        ))}
        <input
          aria-label={ariaLabel}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={add}
          placeholder={values.length ? 'Add another' : placeholder}
        />
      </div>
      {hint && <div className="hint">{hint}</div>}
      {showErr && errMsg && <div className="err-msg">{errMsg}</div>}
    </div>
  );
}

// Ported from the prototype Matchday_Employer.html's #page-registration (~2919-3140): the
// 10-step .wz wizard is condensed to 7 steps that map 1:1 onto the server's
// createRegistrationSchema (Tasks 1+2) -- Role & JD, Eligibility, Compensation, Location,
// Schedule, Evaluation, then a Review & submit step. Required-field validation (mirroring
// EmployerSignup.tsx's per-step `errors` state + `.show-err` toggling) is limited to the fields
// the prototype itself marks required AND the brief calls out: role + openings (step 1) and
// ctcMin/ctcMax (step 3) -- every other field is optional on both the prototype and the zod
// schema. On submit, posts driveId + the top-level fields + a nested `details` object exactly
// matching registrationDetailsSchema; company/industry/employerId are never sent (server-
// authoritative). Renders inside EmployerShell (App.tsx) which already provides the
// ".employer-app" CSS scope, so this intentionally does NOT re-wrap in ".employer-app" (same
// convention as EmployerDriveDetail.tsx/EmployerDashboard.tsx).
export function EmployerRegister() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: drive, isLoading, isError } = useEmployerDrive(id!);
  const createReg = useCreateRegistration();

  const [step, setStep] = useState<Step>(1);
  const [errors, setErrors] = useState<StepErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateRegistrationResult | null>(null);

  // Step 1 -- role & JD
  const [role, setRole] = useState('');
  const [jd, setJd] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [openings, setOpenings] = useState('1');
  const [deadline, setDeadline] = useState('');
  const [urgency, setUrgency] = useState('');

  // Step 2 -- eligibility
  const [mustHave, setMustHave] = useState<string[]>([]);
  const [goodToHave, setGoodToHave] = useState<string[]>([]);
  const [qualification, setQualification] = useState('');
  const [gradYearFrom, setGradYearFrom] = useState('');
  const [gradYearTo, setGradYearTo] = useState('');
  const [expMin, setExpMin] = useState('');
  const [expMax, setExpMax] = useState('');

  // Step 3 -- compensation
  const [ctcMin, setCtcMin] = useState('6');
  const [ctcMax, setCtcMax] = useState('10');
  const [stipend, setStipend] = useState('');

  // Step 4 -- location
  const [cities, setCities] = useState<string[]>([]);
  const [workMode, setWorkMode] = useState('');
  const [officeLocation, setOfficeLocation] = useState('');

  // Step 5 -- schedule
  const [rounds, setRounds] = useState('2');
  const [roundNames, setRoundNames] = useState('');
  const [preferredWednesday, setPreferredWednesday] = useState('');
  const [timeSlot, setTimeSlot] = useState('');

  // Step 6 -- evaluation
  const [minEvalScore, setMinEvalScore] = useState(70);
  const [mandatorySkills, setMandatorySkills] = useState<string[]>([]);

  function validateStep(n: Step): boolean {
    if (n === 1) {
      const next: StepErrors = {};
      if (!role.trim()) next.role = true;
      if (!openings.trim() || Number(openings) < 1) next.openings = true;
      setErrors(next);
      return Object.keys(next).length === 0;
    }
    if (n === 3) {
      const next: StepErrors = {};
      if (!ctcMin.trim()) next.ctcMin = true;
      if (!ctcMax.trim()) next.ctcMax = true;
      else if (ctcMin.trim() && Number(ctcMax) < Number(ctcMin)) next.ctcMax = true;
      setErrors(next);
      return Object.keys(next).length === 0;
    }
    setErrors({});
    return true;
  }

  function onNext(n: Step) {
    if (validateStep(n)) setStep(((n as number) + 1) as Step);
  }

  function onBack(n: Step) {
    setErrors({});
    setStep(((n as number) - 1) as Step);
  }

  async function onSubmit() {
    if (!validateStep(1) || !validateStep(3)) {
      setStep(!role.trim() || Number(openings) < 1 ? 1 : 3);
      return;
    }
    setSubmitError(null);
    try {
      const body: RegistrationInput = {
        driveId: id!,
        role: role.trim(),
        openings: openings.trim() ? Number(openings) : undefined,
        ctcMin: ctcMin.trim() ? Number(ctcMin) : undefined,
        ctcMax: ctcMax.trim() ? Number(ctcMax) : undefined,
        mustHave: mustHave.length ? mustHave : undefined,
        preferredWednesday: preferredWednesday || undefined,
        timeSlot: timeSlot || undefined,
        jd: jd.trim() || undefined,
        details: {
          roleDescription: roleDescription.trim() || undefined,
          deadline: deadline || undefined,
          urgency: urgency || undefined,
          goodToHave: goodToHave.length ? goodToHave : undefined,
          qualification: qualification || undefined,
          gradYearFrom: gradYearFrom.trim() ? Number(gradYearFrom) : undefined,
          gradYearTo: gradYearTo.trim() ? Number(gradYearTo) : undefined,
          expMin: expMin.trim() ? Number(expMin) : undefined,
          expMax: expMax.trim() ? Number(expMax) : undefined,
          stipend: stipend.trim() ? Number(stipend) : undefined,
          cities: cities.length ? cities : undefined,
          workMode: workMode || undefined,
          officeLocation: officeLocation.trim() || undefined,
          rounds: rounds.trim() ? Number(rounds) : undefined,
          roundNames: roundNames.trim() || undefined,
          minEvalScore,
          mandatorySkills: mandatorySkills.length ? mandatorySkills : undefined,
        },
      };
      const res = await createReg.mutateAsync(body);
      setResult(res);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Registration failed');
    }
  }

  if (isLoading) {
    return (
      <div className="page-wrap">
        <div className="card" style={{ padding: 20, color: 'var(--grey)' }}>Loading drive…</div>
      </div>
    );
  }

  if (isError || !drive) {
    return (
      <div className="page-wrap">
        <button type="button" className="link-back" onClick={() => navigate('/employer/drives')}>
          <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back to available drives
        </button>
        <div className="card" style={{ padding: 20 }}>
          <h3>Drive not found</h3>
          <p className="hint">This drive isn&apos;t available — it may have been archived, or the link may be incorrect.</p>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="page-wrap">
        <div className="reg-done">
          <div className="rd-badge"><svg className="ic ic-lg" viewBox="0 0 24 24" style={{ width: 34, height: 34 }}><path d="M5 12l5 5L20 7" /></svg></div>
          <h2>Registration submitted</h2>
          <p>Your requirement for <b>{result.driveName}</b> is in. Our Admin team will review and approve it, then we&rsquo;ll start matching candidates.</p>
          <div className="rd-card">
            <span className="drive-ic"><svg className="ic" viewBox="0 0 24 24"><path d="M9 5h6M7 7H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-2" /><path d="M9 3h6a2 2 0 010 4H9a2 2 0 010-4z" /></svg></span>
            <div style={{ flex: 1 }}><div className="rd-id">{result.id}</div><div className="rd-l">Registration reference</div></div>
            <span className="status-pill st-short">
              <svg className="ic" viewBox="0 0 24 24" style={{ width: 12, height: 12 }}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg> {result.status}
            </span>
          </div>
          <div className="rd-actions">
            <Link className="btn btn-primary btn-lg" to="/employer/registrations">Go to Registration Tracker</Link>
            <Link className="btn btn-ghost btn-lg" to={`/employer/drives/${id}`}>Back to drive</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap" id="regWizard">
      <div className="wz-top">
        <Link className="link-back" to={`/employer/drives/${id}`}>
          <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Cancel
        </Link>
        <span className="wz-ctx">
          <span className="c-ic"><svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 4-5" /></svg></span>
          <span><span className="cv">{drive.name}</span><span className="cl">You&rsquo;re registering for this drive</span></span>
        </span>
      </div>

      <div className="wz-rail-mini">
        <div className="mtxt"><span>{STEP_LABELS[step]}</span><span>{step} / 7</span></div>
        <div className="mbar"><i style={{ width: `${(step / 7) * 100}%` }} /></div>
      </div>

      <div className="wz">
        <div className="wz-rail">
          {([1, 2, 3, 4, 5, 6, 7] as Step[]).map((n) => (
            <div key={n} className={`wz-si ${step === n ? 'active' : step > n ? 'done' : ''}`}>
              <span className="num">{n}</span>
              <span className="lbl">{STEP_LABELS[n]}</span>
            </div>
          ))}
        </div>

        <div className="wz-main">
          <div className="wz-main-head">
            <div className="sc">STEP {step} OF 7</div>
            <h2>{STEP_LABELS[step]}</h2>
          </div>

          <div className="wz-body">
            {step > 1 && step < 7 && (
              <div className="rd-banner action" role="status" style={{ marginLeft: 0, marginRight: 0, marginTop: 0, marginBottom: 18 }}>
                <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M12 8v4M12 16h.01" /><circle cx="12" cy="12" r="9" /></svg>
                <span>Fields pre-filled from your JD — review and edit anything before saving.</span>
              </div>
            )}
            {step === 1 && (
              <div className="wz-step active">
                <div className={`field${errors.role ? ' show-err' : ''}`}>
                  <label>Role title <span className="req">*</span></label>
                  <input
                    className={`input${errors.role ? ' err' : ''}`}
                    aria-label="Role title"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="e.g. Data Analyst"
                  />
                  {errors.role && <div className="err-msg">Enter a role title.</div>}
                </div>
                <div className="field">
                  <label>JD <span className="opt">(optional — paste text or a filename)</span></label>
                  <input
                    className="input"
                    aria-label="JD"
                    value={jd}
                    onChange={(e) => setJd(e.target.value)}
                    placeholder="e.g. data-analyst-jd.pdf"
                  />
                </div>
                <div className="field">
                  <label>Role description <span className="opt">(optional)</span></label>
                  <textarea
                    className="input"
                    aria-label="Role description"
                    rows={4}
                    value={roleDescription}
                    onChange={(e) => setRoleDescription(e.target.value)}
                    placeholder="Summarise the responsibilities and what a great hire looks like."
                  />
                </div>
                <div className="frow">
                  <div className={`field${errors.openings ? ' show-err' : ''}`}>
                    <label>Number of openings <span className="req">*</span></label>
                    <input
                      className={`input${errors.openings ? ' err' : ''}`}
                      aria-label="Number of openings"
                      type="number"
                      min={1}
                      value={openings}
                      onChange={(e) => setOpenings(e.target.value)}
                    />
                    {errors.openings && <div className="err-msg">Enter at least 1 opening.</div>}
                  </div>
                  <div className="field">
                    <label>Hiring deadline <span className="opt">(optional)</span></label>
                    <input
                      className="input"
                      aria-label="Hiring deadline"
                      type="date"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Hiring urgency <span className="opt">(optional)</span></label>
                  <TogglePills options={URGENCY_OPTIONS} value={urgency} onChange={setUrgency} />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="wz-step active">
                <ChipField
                  label="Must-have skills"
                  values={mustHave}
                  onChange={setMustHave}
                  ariaLabel="Must-have skills"
                  placeholder="Add a must-have skill"
                  hint="These drive candidate matching. Type a skill and press Enter."
                />
                <ChipField
                  label="Good-to-have skills"
                  values={goodToHave}
                  onChange={setGoodToHave}
                  ariaLabel="Good-to-have skills"
                  placeholder="Add a nice-to-have skill"
                />
                <div className="field">
                  <label>Qualification <span className="opt">(optional)</span></label>
                  <select
                    className="select"
                    aria-label="Qualification"
                    value={qualification}
                    onChange={(e) => setQualification(e.target.value)}
                  >
                    <option value="">Select qualification</option>
                    {QUALIFICATIONS.map((q) => <option key={q} value={q}>{q}</option>)}
                  </select>
                </div>
                <div className="frow">
                  <div className="field">
                    <label>Graduation year — from <span className="opt">(optional)</span></label>
                    <input
                      className="input"
                      aria-label="Graduation year from"
                      type="number"
                      value={gradYearFrom}
                      onChange={(e) => setGradYearFrom(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Graduation year — to <span className="opt">(optional)</span></label>
                    <input
                      className="input"
                      aria-label="Graduation year to"
                      type="number"
                      value={gradYearTo}
                      onChange={(e) => setGradYearTo(e.target.value)}
                    />
                  </div>
                </div>
                <div className="frow">
                  <div className="field">
                    <label>Experience — min (yrs) <span className="opt">(optional)</span></label>
                    <input
                      className="input"
                      aria-label="Experience min (yrs)"
                      type="number"
                      min={0}
                      max={40}
                      value={expMin}
                      onChange={(e) => setExpMin(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Experience — max (yrs) <span className="opt">(optional)</span></label>
                    <input
                      className="input"
                      aria-label="Experience max (yrs)"
                      type="number"
                      min={0}
                      max={40}
                      value={expMax}
                      onChange={(e) => setExpMax(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="wz-step active">
                <div className="frow">
                  <div className={`field${errors.ctcMin ? ' show-err' : ''}`}>
                    <label>CTC range — min (LPA) <span className="req">*</span></label>
                    <input
                      className={`input${errors.ctcMin ? ' err' : ''}`}
                      aria-label="CTC min (LPA)"
                      type="number"
                      min={0}
                      step={0.5}
                      value={ctcMin}
                      onChange={(e) => setCtcMin(e.target.value)}
                    />
                    {errors.ctcMin && <div className="err-msg">Enter min CTC.</div>}
                  </div>
                  <div className={`field${errors.ctcMax ? ' show-err' : ''}`}>
                    <label>CTC range — max (LPA) <span className="req">*</span></label>
                    <input
                      className={`input${errors.ctcMax ? ' err' : ''}`}
                      aria-label="CTC max (LPA)"
                      type="number"
                      min={0}
                      step={0.5}
                      value={ctcMax}
                      onChange={(e) => setCtcMax(e.target.value)}
                    />
                    {errors.ctcMax && <div className="err-msg">Max must be ≥ min.</div>}
                  </div>
                </div>
                <div className="field">
                  <label>Monthly stipend <span className="opt">(for internships, optional)</span></label>
                  <div className="input-wrap has-pfx">
                    <span className="pfx">₹</span>
                    <input
                      className="input"
                      aria-label="Monthly stipend"
                      type="number"
                      min={0}
                      value={stipend}
                      onChange={(e) => setStipend(e.target.value)}
                      placeholder="e.g. 25000"
                    />
                  </div>
                  <div className="hint">Leave blank for full-time roles.</div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="wz-step active">
                <ChipField
                  label="City / cities"
                  values={cities}
                  onChange={setCities}
                  ariaLabel="Cities"
                  placeholder="Add a city"
                />
                <div className="field">
                  <label>Work mode <span className="opt">(optional)</span></label>
                  <TogglePills options={WORK_MODES} value={workMode} onChange={setWorkMode} />
                </div>
                <div className="field">
                  <label>Office location <span className="opt">(optional)</span></label>
                  <input
                    className="input"
                    aria-label="Office location"
                    value={officeLocation}
                    onChange={(e) => setOfficeLocation(e.target.value)}
                    placeholder="e.g. HITEC City, Hyderabad"
                  />
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="wz-step active">
                <div className="field">
                  <label>Number of rounds <span className="opt">(optional)</span></label>
                  <select
                    className="select"
                    aria-label="Number of rounds"
                    value={rounds}
                    onChange={(e) => setRounds(e.target.value)}
                  >
                    <option value="1">1 round (L1)</option>
                    <option value="2">2 rounds (L1, L2)</option>
                    <option value="3">3 rounds (L1, L2, L3)</option>
                  </select>
                  <div className="hint">Rounds map to the L1–L3 stages in your hiring pipeline.</div>
                </div>
                <div className="field">
                  <label>Round names <span className="opt">(optional)</span></label>
                  <input
                    className="input"
                    aria-label="Round names"
                    value={roundNames}
                    onChange={(e) => setRoundNames(e.target.value)}
                    placeholder="e.g. Screening, Technical, HR"
                  />
                </div>
                <div className="field">
                  <label>Preferred Wednesday <span className="opt">(optional)</span></label>
                  <input
                    className="input"
                    aria-label="Preferred Wednesday"
                    type="date"
                    value={preferredWednesday}
                    onChange={(e) => setPreferredWednesday(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Time slot <span className="opt">(optional)</span></label>
                  <TogglePills options={TIME_SLOTS} value={timeSlot} onChange={setTimeSlot} />
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="wz-step active">
                <div className="field">
                  <label>Minimum evaluation score <span className="opt">(optional)</span></label>
                  <div className="range-wrap">
                    <input
                      className="range"
                      aria-label="Minimum evaluation score"
                      type="range"
                      min={0}
                      max={100}
                      value={minEvalScore}
                      onChange={(e) => setMinEvalScore(Number(e.target.value))}
                    />
                    <span className="range-val">{minEvalScore}%</span>
                  </div>
                  <div className="hint">Candidates below this evaluation score won&rsquo;t be recommended.</div>
                </div>
                <ChipField
                  label="Mandatory skills"
                  values={mandatorySkills}
                  onChange={setMandatorySkills}
                  ariaLabel="Mandatory skills"
                  placeholder="Add a mandatory skill"
                  hint="Usually a subset of your must-have list."
                />
              </div>
            )}

            {step === 7 && (
              <div className="wz-step active">
                <div className="card">
                  <div className="card-head"><h3>Review your requirement</h3></div>
                  <div className="card-body">
                    <div className="dd-facts">
                      <div className="fact"><div><div className="fv">{role || '—'}</div><div className="fl">Role</div></div></div>
                      <div className="fact"><div><div className="fv">{openings || '—'}</div><div className="fl">Openings</div></div></div>
                      <div className="fact"><div><div className="fv">{ctcMin && ctcMax ? `${ctcMin}–${ctcMax} LPA` : '—'}</div><div className="fl">CTC range</div></div></div>
                      <div className="fact"><div><div className="fv">{mustHave.join(', ') || '—'}</div><div className="fl">Must-have skills</div></div></div>
                      <div className="fact"><div><div className="fv">{cities.join(', ') || '—'}</div><div className="fl">Cities</div></div></div>
                      <div className="fact"><div><div className="fv">{[preferredWednesday, timeSlot].filter(Boolean).join(' · ') || '—'}</div><div className="fl">Preferred slot</div></div></div>
                    </div>
                  </div>
                </div>
                {submitError && <p className="otp-err" role="alert" style={{ marginTop: 14 }}>{submitError}</p>}
              </div>
            )}
          </div>

          <div className="wz-actions">
            {step > 1 && (
              <button className="btn btn-ghost" type="button" onClick={() => onBack(step)}>
                <svg className="ic" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back
              </button>
            )}
            <div className="spacer" />
            {step < 7 && (
              <button className="btn btn-primary" type="button" onClick={() => onNext(step)}>
                Continue
                <svg className="ic" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            )}
            {step === 7 && (
              <button className="btn btn-primary" type="button" disabled={createReg.isPending} onClick={onSubmit}>
                {createReg.isPending ? 'Submitting…' : 'Submit registration'}
                <svg className="ic" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
