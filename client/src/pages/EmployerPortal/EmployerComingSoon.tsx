import { useParams } from 'react-router-dom';
import './employerBase.js';

export function EmployerComingSoon() {
  const { slug } = useParams();
  return (
    <div className="employer-app">
      <div className="wrap" style={{ padding: '48px 0' }}>
        <h1>Coming soon: {slug}</h1>
      </div>
    </div>
  );
}
