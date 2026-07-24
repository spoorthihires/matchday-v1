import { type FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.js';
import { homePathFor } from '../../auth/roles.js';
import './employerBase.js';

// Ported from the prototype Matchday_Employer.html lines ~2467-2576 (the "sign in" panel of
// view-login; the forgot-password panel and SSO buttons are not part of this slice). This is
// the REAL login: it extends the existing multi-role auth via useAuth().login. On success the
// flow continues to the MFA stub (Task 5 brief) rather than straight to the dashboard.
export function EmployerLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login, token, user } = useAuth();
  const navigate = useNavigate();
  // Snapshot the auth state at mount: this guard only redirects users who arrive ALREADY
  // signed in. It must NOT fire after a fresh login on this screen (token would flip truthy),
  // or it would race the imperative navigate('/employer/mfa') below and skip the MFA step.
  const [wasAuthed] = useState(() => !!token);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(email, password);
      navigate('/employer/mfa');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setPending(false);
    }
  }

  // Already authenticated at mount: redirect without calling navigate() during render. Uses the
  // mount snapshot (not live `token`) so a fresh login here proceeds to the MFA stub deterministically.
  if (wasAuthed) return <Navigate to={homePathFor(user?.role)} replace />;

  return (
    <div className="employer-app">
      <div className="auth">
        <aside className="auth-aside">
          <div className="aa-grid" />
          <Link className="brand" to="/employer">
            <span className="logo-mark">
              <svg viewBox="0 0 36 36" width="28" height="28" fill="none">
                <rect x="2" y="2" width="32" height="32" rx="5" stroke="#1E3A8A" strokeWidth="2.5" fill="white" />
                <polyline points="8,18 15,25 28,11" stroke="#FF6F0B" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="brand-text"><span className="brand-name"><span className="match">Match</span><span className="day">Day</span></span><span className="brand-tagline">AI/ML &amp; Data Hiring Drive</span></span>
          </Link>
          <div className="aa-body">
            <h2>Welcome back. This Wednesday&rsquo;s pool is waiting.</h2>
            <p>Sign in to manage your registrations, review jobseekers and book your next slot.</p>
            <ul className="aa-list">
              <li>
                <span className="ck"><svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg></span>
                Single sign-on for your whole team
              </li>
              <li>
                <span className="ck">
                  <svg className="ic ic-sm" viewBox="0 0 24 24">
                    <path d="M12 22s-7-4.35-7-11a7 7 0 0114 0c0 6.65-7 11-7 11z" />
                    <circle cx="12" cy="11" r="2.4" />
                  </svg>
                </span>
                Protected by multi-factor auth
              </li>
            </ul>
          </div>
        </aside>

        <main className="auth-main">
          <div className="am-inner">
            <div className="am-top">
              <Link className="link-back" to="/employer">
                <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back
              </Link>
            </div>

            <div className="login-card">
              <div className="lc-panel active">
                <div className="am-head">
                  <h1>Log in to MatchDay</h1>
                  <p>Use your work email to continue.</p>
                </div>

                <form onSubmit={onSubmit}>
                  <div className="field" style={{ marginTop: 22 }}>
                    <label>Work email <span className="req">*</span></label>
                    <input
                      className="input"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      aria-label="Email"
                      autoComplete="username"
                    />
                  </div>
                  <div className="field">
                    <label>Password <span className="req">*</span></label>
                    <div className="pw-field">
                      <input
                        className="input"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        aria-label="Password"
                        autoComplete="current-password"
                      />
                    </div>
                  </div>

                  {error && <p className="otp-err" role="alert">{error}</p>}

                  <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={pending}>
                    {pending ? 'Logging in…' : 'Log in'}
                  </button>
                </form>

                <div className="login-foot">
                  New to MatchDay? <Link to="/employer/signup">Create an employer account</Link>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
