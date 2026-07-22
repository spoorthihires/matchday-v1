import { useInterviews } from '../../hooks/useActivity.js';

function tagClass(status: string): string {
  const s = status.toLowerCase();
  if (s === 'completed') return 'tag selected';
  if (s === 'cancelled') return 'tag closed';
  return 'tag progress';
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function Interviews() {
  const q = useInterviews();
  const items = q.data?.items ?? [];
  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>My interviews</h2>
      {q.isLoading ? <div className="card" style={{ padding: 16, color: 'var(--muted)' }}>Loading…</div>
        : items.length === 0 ? <div className="portal-empty">No interviews scheduled.</div>
        : <div className="drive-list">
          {items.map((iv) => (
            <div className="drive" key={iv.interviewId}>
              <div className="info">
                <b>{iv.company}</b>
                <div className="meta">
                  <span>{iv.driveName}</span>
                  <span>{fmtDate(iv.date)}{iv.time ? ` · ${iv.time}` : ''}</span>
                  {iv.interviewers.length > 0 && <span>{iv.interviewers.join(', ')}</span>}
                </div>
              </div>
              <div className="meta" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className={tagClass(iv.status)}>{iv.status}</span>
                {iv.link && <a className="btn" href={iv.link} target="_blank" rel="noreferrer">Join</a>}
              </div>
            </div>
          ))}
        </div>}
    </div>
  );
}
