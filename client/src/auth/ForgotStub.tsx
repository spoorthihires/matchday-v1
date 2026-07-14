import { Link } from 'react-router-dom';

export function ForgotStub() {
  return (
    <div id="auth-screen">
      <section className="view active" aria-labelledby="forgot-title">
        <h2 id="forgot-title">Reset your password</h2>
        <p>Password reset is not enabled in this build.</p>
        <Link className="link" to="/login">Back to sign in</Link>
      </section>
    </div>
  );
}
