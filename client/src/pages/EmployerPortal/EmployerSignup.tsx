import { type KeyboardEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, apiFetch } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.js';
import './employerBase.js';

type Step = 1 | 2 | 3;

const INDUSTRIES = [
  'IT Services', 'Product / SaaS', 'Fintech', 'E-commerce',
  'Healthcare / HealthTech', 'AI / ML Research', 'Consulting', 'GCC / Captive', 'Other',
];
// Must exactly match the Employer.size Mongoose enum (server/src/models/Employer.ts) --
// offering any other value 500s the signup with a ValidationError and creates no account.
const SIZES = ['1–50', '51–200', '201–1000', '1000+'];
const HIRING_TYPES = ['Fresher', 'Lateral', 'Internship'];

interface StepErrors {
  name?: boolean;
  industry?: boolean;
  spoc?: boolean;
  email?: boolean;
  consent?: boolean;
  password?: boolean;
}

// Ported from the prototype Matchday_Employer.html lines ~2224-2417 (view-signup). Replaces
// the Task 4 placeholder with the real 3-step employer signup wizard. Required fields per step
// mirror the server's employerSignupSchema (Task 1): name+industry (step 1), spoc+email
// (step 2), acceptTerms+acceptPrivacy+password (step 3) -- the remaining fields the prototype
// collects (website, size, hiringType, workLocations, designation, phone, billingContact,
// gstNumber) are optional on both sides. On submit: POST /auth/employer-signup, then reuse
// useAuth().login to establish the session (zero AuthContext change), then hand off to the
// email-verification stub (Task 5).
export function EmployerSignup() {
  const [step, setStep] = useState<Step>(1);
  const [errors, setErrors] = useState<StepErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Step 1 -- company
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [industry, setIndustry] = useState('');
  const [size, setSize] = useState('');
  const [hiringType, setHiringType] = useState('');
  const [workLocations, setWorkLocations] = useState<string[]>([]);
  const [locationInput, setLocationInput] = useState('');

  // Step 2 -- contact
  const [spoc, setSpoc] = useState('');
  const [designation, setDesignation] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Step 3 -- billing + consent
  const [billingContact, setBillingContact] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [password, setPassword] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  function addLocation() {
    const v = locationInput.trim().replace(/,$/, '');
    if (v && !workLocations.some((l) => l.toLowerCase() === v.toLowerCase())) {
      setWorkLocations((prev) => [...prev, v]);
    }
    setLocationInput('');
  }

  function onLocationKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addLocation();
    } else if (e.key === 'Backspace' && !locationInput && workLocations.length) {
      setWorkLocations((prev) => prev.slice(0, -1));
    }
  }

  function removeLocation(i: number) {
    setWorkLocations((prev) => prev.filter((_, idx) => idx !== i));
  }

  function validateStep(n: Step): boolean {
    if (n === 1) {
      const next: StepErrors = {};
      if (!name.trim()) next.name = true;
      if (!industry) next.industry = true;
      setErrors(next);
      return Object.keys(next).length === 0;
    }
    if (n === 2) {
      const next: StepErrors = {};
      if (!spoc.trim()) next.spoc = true;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = true;
      setErrors(next);
      return Object.keys(next).length === 0;
    }
    const next: StepErrors = {};
    if (!acceptTerms || !acceptPrivacy) next.consent = true;
    if (password.length < 6) next.password = true;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function onNext(n: Step) {
    if (validateStep(n)) setStep((n + 1) as Step);
  }

  function onBack(n: Step) {
    setErrors({});
    setStep((n - 1) as Step);
  }

  async function onSubmit() {
    if (!validateStep(3)) return;
    setSubmitError(null);
    setPending(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(), industry, spoc: spoc.trim(), email: email.trim(),
        acceptTerms, acceptPrivacy, password,
      };
      if (website.trim()) body.website = website.trim();
      if (size) body.size = size;
      if (hiringType) body.hiringType = hiringType;
      if (workLocations.length) body.workLocations = workLocations;
      if (designation.trim()) body.designation = designation.trim();
      if (phone.trim()) body.phone = phone.trim();
      if (billingContact.trim()) body.billingContact = billingContact.trim();
      if (gstNumber.trim()) body.gstNumber = gstNumber.trim();

      await apiFetch('/auth/employer-signup', { method: 'POST', body });
      await login(email.trim(), password);
      navigate('/employer/verify');
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Signup failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="employer-app">
      <div className="auth">
        <aside className="auth-aside">
          <div className="aa-grid" />
          <Link className="brand" to="/employer">
            <span className="logo-mark">
              <svg className="ic ic-sm" viewBox="0 0 24 24">
                <path d="M4 7l8-4 8 4-8 4-8-4z" />
                <path d="M4 7v6l8 4 8-4V7" />
              </svg>
            </span>
            <span>Hiringhood<small>MatchDay</small></span>
          </Link>
          <div className="aa-body">
            <h2>Set up your company once. Hire every Wednesday.</h2>
            <p>Register your organisation to browse drives, book slots and review pre-evaluated AI/ML talent.</p>
            <ul className="aa-list">
              <li><span className="ck"><svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg></span> Browse role-specific MatchDay drives</li>
              <li><span className="ck"><svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg></span> Review redacted candidate passports</li>
              <li><span className="ck"><svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg></span> Interview a shortlist in one slot</li>
            </ul>
          </div>
        </aside>

        <main className="auth-main">
          <div className="am-inner">
            <div className="am-top">
              <Link className="link-back" to="/employer">
                <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back
              </Link>
              <span className="alt">Already registered? <Link to="/employer/login">Log in</Link></span>
            </div>

            <div className="am-head">
              <h1>Create your employer account</h1>
              <p>Three quick steps, then verify your email and you&rsquo;re in.</p>
            </div>

            <div className="steps">
              <div className={`step-i ${step === 1 ? 'active' : step > 1 ? 'done' : ''}`}><span className="dot">1</span><span className="st">Company</span></div>
              <div className="bar" />
              <div className={`step-i ${step === 2 ? 'active' : step > 2 ? 'done' : ''}`}><span className="dot">2</span><span className="st">Contact</span></div>
              <div className="bar" />
              <div className={`step-i ${step === 3 ? 'active' : ''}`}><span className="dot">3</span><span className="st">Review &amp; consent</span></div>
            </div>

            {step === 1 && (
              <div className="fstep active" data-step="1">
                <div className={`field full${errors.name ? ' show-err' : ''}`}>
                  <label>Company name <span className="req">*</span></label>
                  <input
                    className={`input${errors.name ? ' err' : ''}`}
                    aria-label="Company name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. ABC Technologies"
                  />
                  {errors.name && <div className="err-msg">Enter your company name.</div>}
                </div>
                <div className="frow">
                  <div className="field">
                    <label>Website</label>
                    <div className="input-wrap has-pfx">
                      <span className="pfx">https://</span>
                      <input
                        className="input"
                        aria-label="Website"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="abc.com"
                      />
                    </div>
                  </div>
                  <div className={`field${errors.industry ? ' show-err' : ''}`}>
                    <label>Industry <span className="req">*</span></label>
                    <select
                      className={`select${errors.industry ? ' err' : ''}`}
                      aria-label="Industry"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                    >
                      <option value="">Select industry</option>
                      {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                    </select>
                    {errors.industry && <div className="err-msg">Select an industry.</div>}
                  </div>
                </div>
                <div className="frow">
                  <div className="field">
                    <label>Company size</label>
                    <select
                      className="select"
                      aria-label="Company size"
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                    >
                      <option value="">Select size</option>
                      {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Hiring type</label>
                    <div className="toggle-row">
                      {HIRING_TYPES.map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={`toggle-pill ${hiringType === v ? 'on' : ''}`}
                          onClick={() => setHiringType(hiringType === v ? '' : v)}
                        >
                          <span className="tk"><svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg></span>{v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="field full">
                  <label>Work locations</label>
                  <div className="chips-input">
                    {workLocations.map((loc, i) => (
                      <span className="chip" key={loc}>
                        {loc}
                        <button type="button" aria-label={`Remove ${loc}`} onClick={() => removeLocation(i)}>
                          <svg className="ic ic-sm" viewBox="0 0 24 24" style={{ width: 13, height: 13 }}><path d="M6 6l12 12M18 6L6 18" /></svg>
                        </button>
                      </span>
                    ))}
                    <input
                      aria-label="Work locations"
                      value={locationInput}
                      onChange={(e) => setLocationInput(e.target.value)}
                      onKeyDown={onLocationKeyDown}
                      onBlur={addLocation}
                      placeholder={workLocations.length ? 'Add another' : 'Type a city and press Enter'}
                    />
                  </div>
                  <div className="hint">Add every city you hire in — e.g. Hyderabad, Bengaluru.</div>
                </div>
                <div className="form-actions">
                  <div className="spacer" />
                  <button className="btn btn-primary" type="button" onClick={() => onNext(1)}>
                    Continue
                    <svg className="ic" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="fstep active" data-step="2">
                <div className="frow">
                  <div className={`field${errors.spoc ? ' show-err' : ''}`}>
                    <label>Hiring contact name <span className="req">*</span></label>
                    <input
                      className={`input${errors.spoc ? ' err' : ''}`}
                      aria-label="Hiring contact name"
                      value={spoc}
                      onChange={(e) => setSpoc(e.target.value)}
                      placeholder="e.g. Asha Nambala"
                    />
                    {errors.spoc && <div className="err-msg">Enter the contact name.</div>}
                  </div>
                  <div className="field">
                    <label>Designation</label>
                    <input
                      className="input"
                      aria-label="Designation"
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      placeholder="e.g. TA Manager"
                    />
                  </div>
                </div>
                <div className="frow">
                  <div className={`field${errors.email ? ' show-err' : ''}`}>
                    <label>Work email <span className="req">*</span></label>
                    <input
                      className={`input${errors.email ? ' err' : ''}`}
                      type="email"
                      aria-label="Work email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                    />
                    {errors.email && <div className="err-msg">Enter a valid work email.</div>}
                  </div>
                  <div className="field">
                    <label>Phone number</label>
                    <div className="input-wrap has-pfx">
                      <span className="pfx">+91</span>
                      <input
                        className="input"
                        aria-label="Phone number"
                        inputMode="numeric"
                        maxLength={10}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                        placeholder="98765 43210"
                      />
                    </div>
                  </div>
                </div>
                <div className="opt-note" style={{ marginTop: 4 }}>
                  <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M12 22s-7-4.35-7-11a7 7 0 0114 0c0 6.65-7 11-7 11z" /><circle cx="12" cy="11" r="2.4" /></svg>
                  We&rsquo;ll send a verification code to this email to confirm it&rsquo;s really you.
                </div>
                <div className="form-actions">
                  <button className="btn btn-ghost" type="button" onClick={() => onBack(2)}>
                    <svg className="ic" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back
                  </button>
                  <div className="spacer" />
                  <button className="btn btn-primary" type="button" onClick={() => onNext(2)}>
                    Continue
                    <svg className="ic" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="fstep active" data-step="3">
                <div className="opt-note">
                  <svg className="ic ic-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>
                  Billing details are optional for now — add them later before you confirm a paid drive.
                </div>
                <div className="frow">
                  <div className="field">
                    <label>Billing contact <span className="opt">(optional)</span></label>
                    <input
                      className="input"
                      aria-label="Billing contact"
                      value={billingContact}
                      onChange={(e) => setBillingContact(e.target.value)}
                      placeholder="Finance contact name / email"
                    />
                  </div>
                  <div className="field">
                    <label>GST number <span className="opt">(optional)</span></label>
                    <input
                      className="input"
                      aria-label="GST number"
                      value={gstNumber}
                      onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                      placeholder="22ABCDE1234F1Z5"
                      style={{ textTransform: 'uppercase' }}
                    />
                  </div>
                </div>
                <div className={`field${errors.password ? ' show-err' : ''}`}>
                  <label>Password <span className="req">*</span></label>
                  <input
                    className={`input${errors.password ? ' err' : ''}`}
                    type="password"
                    aria-label="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                  />
                  {errors.password && <div className="err-msg">Password must be at least 6 characters.</div>}
                </div>

                <div
                  className={`field${errors.consent ? ' show-err' : ''}`}
                  style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 6 }}
                >
                  <div className="consent">
                    <div
                      className={`check ${acceptTerms ? 'on' : ''}`}
                      role="checkbox"
                      aria-checked={acceptTerms}
                      aria-label="Accept the MatchDay Terms of Service"
                      tabIndex={0}
                      onClick={() => setAcceptTerms((v) => !v)}
                      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setAcceptTerms((v) => !v); } }}
                    >
                      <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg>
                    </div>
                    <label onClick={() => setAcceptTerms((v) => !v)}>
                      I accept the <a onClick={(e) => e.stopPropagation()}>MatchDay Terms of Service</a> and confirm I&rsquo;m authorised to register this company.
                    </label>
                  </div>
                  <div className="consent">
                    <div
                      className={`check ${acceptPrivacy ? 'on' : ''}`}
                      role="checkbox"
                      aria-checked={acceptPrivacy}
                      aria-label="Accept the Privacy Policy"
                      tabIndex={0}
                      onClick={() => setAcceptPrivacy((v) => !v)}
                      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setAcceptPrivacy((v) => !v); } }}
                    >
                      <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg>
                    </div>
                    <label onClick={() => setAcceptPrivacy((v) => !v)}>
                      I&rsquo;ve read and agree to the <a onClick={(e) => e.stopPropagation()}>Privacy Policy</a>, including how candidate data is handled.
                    </label>
                  </div>
                  {errors.consent && <div className="err-msg" style={{ marginTop: 8 }}>Please accept both the Terms and Privacy Policy to continue.</div>}
                </div>

                {submitError && <p className="otp-err" role="alert">{submitError}</p>}

                <div className="form-actions">
                  <button className="btn btn-ghost" type="button" onClick={() => onBack(3)}>
                    <svg className="ic" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back
                  </button>
                  <div className="spacer" />
                  <button className="btn btn-primary" type="button" disabled={pending} onClick={onSubmit}>
                    {pending ? 'Creating account…' : 'Create account & verify'}
                    <svg className="ic" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
