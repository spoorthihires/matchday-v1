import { Link } from 'react-router-dom';

export function MfaStub() {
  return (
    <div id="auth-screen">
      <section className="view active" aria-labelledby="mfa-title">
        <h2 id="mfa-title">Two-factor verification</h2>
        <p>MFA is not enabled in this build.</p>
        <Link className="link" to="/login">Back to sign in</Link>
      </section>
    </div>
  );
}
