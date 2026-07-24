import { type ChangeEvent, type KeyboardEvent, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './employerBase.js';

const OTP_LENGTH = 6;

// Ported from the prototype Matchday_Employer.html lines ~2577-2629 (view-mfa). This is a
// UI STUB per the Task 5 brief: any well-formed 6-digit code advances straight to the
// dashboard — there is no real TOTP verification yet.
export function EmployerMfa() {
  const [digits, setDigits] = useState<string[]>(() => Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState<string | null>(null);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();

  function onDigitChange(index: number, e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    if (value && index < OTP_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  }

  function onKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  function onVerify() {
    const code = digits.join('');
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code.');
      return;
    }
    setError(null);
    navigate('/employer/dashboard');
  }

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
            <h2>Just confirming it&rsquo;s you.</h2>
            <p>Multi-factor authentication keeps your candidate data and hiring pipeline secure.</p>
            <ul className="aa-list">
              <li>
                <span className="ck"><svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg></span>
                Password accepted
              </li>
              <li>
                <span className="ck">
                  <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M12 8v5l3 2" /><circle cx="12" cy="12" r="9" /></svg>
                </span>
                Awaiting your 6-digit code
              </li>
            </ul>
          </div>
        </aside>

        <main className="auth-main">
          <div className="am-inner">
            <div className="am-top">
              <Link className="link-back" to="/employer/login">
                <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back to log in
              </Link>
            </div>
            <div className="verify-card">
              <div className="verify-badge">
                <svg className="ic ic-lg" viewBox="0 0 24 24">
                  <path d="M12 22s-7-4.35-7-11a7 7 0 0114 0c0 6.65-7 11-7 11z" />
                  <path d="M9 11l2 2 4-4" />
                </svg>
              </div>
              <h1>Two-factor verification</h1>
              <p>Enter the 6-digit code from your authenticator app.</p>
              <div className="mfa-method" style={{ marginTop: 22 }}>
                <span className="mm-ic">
                  <svg className="ic" viewBox="0 0 24 24">
                    <rect x="6" y="2" width="12" height="20" rx="2" />
                    <path d="M11 18h2" />
                  </svg>
                </span>
                <div>
                  <div className="mm-t">Authenticator app</div>
                  <div className="mm-s">Time-based one-time code</div>
                </div>
              </div>
              <div className="otp">
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputsRef.current[i] = el; }}
                    maxLength={1}
                    inputMode="numeric"
                    aria-label={`Digit ${i + 1}`}
                    value={d}
                    onChange={(e) => onDigitChange(i, e)}
                    onKeyDown={(e) => onKeyDown(i, e)}
                    className={d ? 'filled' : undefined}
                  />
                ))}
              </div>
              <div className="otp-err" role="alert">{error}</div>
              <button className="btn btn-primary btn-lg btn-block" type="button" onClick={onVerify}>
                Verify &amp; go to dashboard
              </button>
              <a className="link-backup" href="#" onClick={(e) => e.preventDefault()}>Use a backup code instead</a>
              <div className="verify-hint">Prototype: enter any 6 digits to continue.</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
