import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { useAuth } from './AuthContext.js';
import { useLogin } from '../hooks/useLogin.js';
import { homePathFor } from './roles.js';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const login = useLogin();
  const navigate = useNavigate();
  const { token, user } = useAuth();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const signedIn = await login.mutateAsync({ email, password });
      navigate(homePathFor(signedIn.role), { replace: true });
    } catch { /* error surfaced below via login.error */ }
  }

  const errorMsg = login.error instanceof ApiError ? login.error.message : login.error ? 'Login failed' : null;

  // Already authenticated: redirect without calling navigate() during render
  // (which would emit a React warning). See task-9 report for details.
  if (token) return <Navigate to={homePathFor(user?.role)} replace />;

  return (
    <div id="auth-screen">
      <header className="topbar">
        <div className="brand">
          <span className="glyph"><i className="ti ti-calendar-bolt" /></span>
          <div>Hiringhood <small>MatchDay Admin</small></div>
        </div>
        <div className="env"><i className="ti ti-circle-filled" /><span>Production</span></div>
      </header>
      <div className="shell">
        <section className="panel" aria-hidden="true">
          <div>
            <span className="eyebrow"><i className="ti ti-command" /> Command center</span>
            <h1>Run every hiring drive from <em>one console.</em></h1>
            <p className="lede">
              Orchestrate Employers, Institutes, Vendors, Recruiters and Jobseekers across recurring Wednesday
              drives.
            </p>
          </div>
          <div className="foot">Secured with SSO &amp; multi-factor authentication · SOC 2 aligned</div>
        </section>

        <main className="authwrap">
          <div className="card">
            <section className="view active" id="v-login" aria-labelledby="login-title">
              <div className="kicker">Sign in</div>
              <h2 id="login-title">Sign in to MatchDay</h2>
              <p className="sub">Use your MatchDay credentials to continue.</p>
              <form onSubmit={onSubmit}>
                <div className="inp">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    aria-label="Email"
                    autoComplete="username"
                  />
                </div>
                <div className="inp">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    aria-label="Password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    <i className={showPassword ? 'ti ti-eye-off' : 'ti ti-eye'} />
                  </button>
                </div>
                {errorMsg && <p className="auth-error" role="alert">{errorMsg}</p>}
                <button className="btn btn-primary" type="submit" disabled={login.isPending}>
                  {login.isPending ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
              <div className="cardfoot">Admins and jobseekers sign in here</div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
