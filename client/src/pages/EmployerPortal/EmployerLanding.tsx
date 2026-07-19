import { Link } from 'react-router-dom';
import './employerBase.js';

// Placeholder for Task 4 (routing scaffold). Task 5 replaces this with the ported
// landing page (Matchday_Employer.html lines ~1869-2223).
export function EmployerLanding() {
  return (
    <div className="employer-app">
      <div className="wrap" style={{ padding: '48px 0' }}>
        <h1>Employer Landing</h1>
        <p>
          <Link to="/employer/login">Log in</Link> · <Link to="/employer/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
