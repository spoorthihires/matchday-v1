import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { useAuth } from './AuthContext.js';
import { useLogin } from '../hooks/useLogin.js';

export function LoginPage() {
  const [email, setEmail] = useState('admin@matchday.dev');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const navigate = useNavigate();
  const { token } = useAuth();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login.mutateAsync({ email, password });
      navigate('/', { replace: true });
    } catch { /* error surfaced below via login.error */ }
  }

  const errorMsg = login.error instanceof ApiError ? login.error.message : login.error ? 'Login failed' : null;

  // Already authenticated: redirect without calling navigate() during render
  // (which would emit a React warning). See task-9 report for details.
  if (token) return <Navigate to="/" replace />;

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
              <div className="kicker">Admin access</div>
              <h2 id="login-title">Sign in to MatchDay</h2>
              <p className="sub">Use your Hiringhood admin credentials to continue.</p>
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
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    aria-label="Password"
                    autoComplete="current-password"
                  />
                </div>
                {errorMsg && <p className="auth-error" role="alert">{errorMsg}</p>}
                <button className="btn btn-primary" type="submit" disabled={login.isPending}>
                  {login.isPending ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
              <div className="cardfoot">Restricted to authorized administrators</div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
