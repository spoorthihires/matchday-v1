import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, apiFetch } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.js';
import { useInstitutes } from '../../hooks/useJobseekerSignup.js';

// Public jobseeker signup, route /jobseekers/signup -- the "Join free"/"Register" CTAs on
// JobseekerLanding.tsx link here. Unlike EmployerSignup (a 3-step wizard with its own scoped
// employer.css), this is a single-step form reusing the SAME #auth-screen auth-chrome classes
// (theme.css) that LoginPage.tsx already uses -- that stylesheet is imported globally
// (client/src/main.tsx) and already serves the jobseeker role (LoginPage's "Admins and
// jobseekers sign in here"), so no new/global CSS is needed here.
//
// Mirrors EmployerSignup's submit flow: POST the signup, then reuse useAuth().login (the same
// AuthContext method EmployerSignup calls) to establish the session, then navigate. Jobseeker
// signup lands an immediately-active seeker (stage 'Applied') -- no admin approval gate, unlike
// employer signup which lands Pending -- so we go straight to /portal instead of a verify stub.
interface FormErrors {
  name?: boolean;
  email?: boolean;
  password?: boolean;
  instituteId?: boolean;
  branch?: boolean;
  gradYear?: boolean;
  source?: boolean;
  cgpa?: boolean;
}

export function JobseekerSignup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [instituteId, setInstituteId] = useState('');
  const [branch, setBranch] = useState('');
  const [gradYear, setGradYear] = useState('');
  const [source, setSource] = useState('');
  const [cgpa, setCgpa] = useState('');

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const { data: institutesData } = useInstitutes();
  const institutes = institutesData?.items ?? [];

  const { login } = useAuth();
  const navigate = useNavigate();

  function validate(): boolean {
    const next: FormErrors = {};
    if (!name.trim()) next.name = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = true;
    if (password.length < 8) next.password = true;
    if (!instituteId) next.instituteId = true;
    if (!branch.trim()) next.branch = true;
    if (!gradYear || Number.isNaN(Number(gradYear))) next.gradYear = true;
    if (!source.trim()) next.source = true;
    if (!cgpa || Number.isNaN(Number(cgpa))) next.cgpa = true;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitError(null);
    setPending(true);
    try {
      const body = {
        name: name.trim(),
        email: email.trim(),
        password,
        instituteId,
        branch: branch.trim(),
        gradYear: Number(gradYear),
        source: source.trim(),
        cgpa: Number(cgpa),
      };
      await apiFetch('/auth/jobseeker-signup', { method: 'POST', body });
      await login(email.trim(), password);
      navigate('/portal');
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Signup failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <div id="auth-screen">
      <div className="authwrap" style={{ minHeight: '100vh' }}>
        <div className="card" style={{ maxWidth: 480 }}>
          <Link className="back" to="/jobseeker">
            <span aria-hidden="true">&larr;</span> Back to MatchDay
          </Link>
          <div className="kicker">Get started</div>
          <h2>Create your jobseeker account</h2>
          <p className="sub">
            Build one profile, take one assessment, and get matched to every company hiring in
            your stream this Wednesday.
          </p>

          <form onSubmit={onSubmit} noValidate>
            <div className={`field${errors.name ? ' invalid' : ''}`}>
              <label>Full name</label>
              <div className="inp">
                <input
                  aria-label="Full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Aarav Sharma"
                />
              </div>
            </div>

            <div className={`field${errors.email ? ' invalid' : ''}`}>
              <label>Email</label>
              <div className="inp">
                <input
                  type="email"
                  aria-label="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="username"
                />
              </div>
            </div>

            <div className={`field${errors.password ? ' invalid' : ''}`}>
              <label>Password</label>
              <div className="inp">
                <input
                  type="password"
                  aria-label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className={`field${errors.instituteId ? ' invalid' : ''}`}>
              <label>Institute</label>
              <div className="inp">
                <select
                  aria-label="Institute"
                  value={instituteId}
                  onChange={(e) => setInstituteId(e.target.value)}
                  style={{ flex: 1, width: '100%', border: 0, background: 'transparent', padding: '12px 14px', fontSize: 14.5, fontFamily: 'inherit', color: 'var(--ink)', outline: 'none' }}
                >
                  <option value="">Select institute</option>
                  {institutes.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
            </div>

            <div className={`field${errors.branch ? ' invalid' : ''}`}>
              <label>Branch</label>
              <div className="inp">
                <input
                  aria-label="Branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="e.g. Computer Science"
                />
              </div>
            </div>

            <div className={`field${errors.gradYear ? ' invalid' : ''}`}>
              <label>Graduation year</label>
              <div className="inp">
                <input
                  type="number"
                  aria-label="Graduation year"
                  value={gradYear}
                  onChange={(e) => setGradYear(e.target.value)}
                  placeholder="e.g. 2026"
                />
              </div>
            </div>

            <div className={`field${errors.source ? ' invalid' : ''}`}>
              <label>How did you hear about us?</label>
              <div className="inp">
                <input
                  aria-label="How did you hear about us?"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="e.g. LinkedIn, campus drive, referral"
                />
              </div>
            </div>

            <div className={`field${errors.cgpa ? ' invalid' : ''}`}>
              <label>CGPA</label>
              <div className="inp">
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={10}
                  aria-label="CGPA"
                  value={cgpa}
                  onChange={(e) => setCgpa(e.target.value)}
                  placeholder="e.g. 8.5"
                />
              </div>
            </div>

            {submitError && <p className="auth-error" role="alert">{submitError}</p>}

            <button className="btn btn-primary" type="submit" disabled={pending}>
              {pending ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <div className="cardfoot">Already have an account? <Link to="/login">Log in</Link></div>
        </div>
      </div>
    </div>
  );
}
