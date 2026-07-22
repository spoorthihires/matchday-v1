import { Navigate, useNavigate } from 'react-router-dom';
import { useEmployerRegistrations } from './hooks/useEmployerRegistrations.js';
import './employerBase.js';

// The pipeline board and interviews are per-drive (/employer/drives/:id/board and /:id/interviews).
// The sidebar "Kanban" / "Interviews" items route here; this resolves the employer's
// approved-registration drive(s): auto-open when there's exactly one, offer a picker when there
// are several, or show an empty state prompting registration when there are none.
export function EmployerPipelineEntry({ target, title, subtitle }: {
  target: 'board' | 'interviews';
  title: string;
  subtitle: string;
}) {
  const navigate = useNavigate();
  const q = useEmployerRegistrations();

  if (q.isLoading) {
    return <div className="page-wrap"><div className="card" style={{ padding: 20, color: 'var(--grey)' }}>Loading…</div></div>;
  }
  if (q.isError) {
    return <div className="page-wrap"><div className="card" style={{ padding: 20, color: '#e0463c' }}>Failed to load your drives.</div></div>;
  }

  // approved registrations → distinct drives
  const seen = new Set<string>();
  const drives = (q.data?.items ?? [])
    .filter((r) => r.status === 'Approved' && r.driveId)
    .filter((r) => (seen.has(r.driveId) ? false : (seen.add(r.driveId), true)));

  if (drives.length === 1) {
    return <Navigate to={`/employer/drives/${drives[0].driveId}/${target}`} replace />;
  }

  return (
    <div className="page-wrap">
      <div className="dash-greet"><h2>{title}</h2><p>{subtitle}</p></div>
      {drives.length === 0 ? (
        <div className="card" style={{ padding: 20 }}>
          <p className="hint" style={{ marginBottom: 12 }}>
            {title} is organized per drive. You don&apos;t have an approved drive yet — register for a drive,
            and once it&apos;s approved your pipeline will appear here.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/employer/drives')}>Browse drives</button>
        </div>
      ) : (
        <div className="card">
          <div className="card-head"><h3>Choose a drive</h3></div>
          <div className="card-body">
            {drives.map((d) => (
              <div className="drive-row" key={d.driveId}>
                <div><div className="dn">{d.driveName || 'Drive'}</div></div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => navigate(`/employer/drives/${d.driveId}/${target}`)}
                >
                  {target === 'board' ? 'Open board' : 'Open interviews'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
