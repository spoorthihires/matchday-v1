import { useState } from 'react';
import { useRevealRequests, useRespondReveal } from '../../hooks/useReveal.js';
import type { RevealRequestItem } from '../../types/portal.js';

function label(r: RevealRequestItem): string {
  if (r.status === 'granted') return 'Shared';
  if (r.status === 'declined') return 'Declined';
  if (r.expired) return 'Expired';
  return 'Pending';
}
function tagClass(r: RevealRequestItem): string {
  if (r.status === 'granted') return 'tag selected';
  if (r.status === 'declined' || r.expired) return 'tag closed';
  return 'tag progress';
}

export function RevealRequests() {
  const q = useRevealRequests();
  const respond = useRespondReveal();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const items = q.data?.items ?? [];
  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Identity reveal requests</h2>
      {q.isLoading ? <div className="card" style={{ padding: 16, color: 'var(--muted)' }}>Loading…</div>
        : items.length === 0 ? <div className="portal-empty">No identity reveal requests.</div>
        : <div className="drive-list">
          {items.map((r) => {
            const actionable = r.status === 'requested' && !r.expired;
            return (
              <div className="drive" key={r.applicationId}>
                <div className="info"><b>{r.company}</b><div className="meta">{r.driveName}</div></div>
                <div className="meta" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span className={tagClass(r)}>{label(r)}</span>
                  {actionable && confirmId !== r.applicationId && (
                    <>
                      <button type="button" className="btn" disabled={respond.isPending} onClick={() => setConfirmId(r.applicationId)}>Grant</button>
                      <button type="button" className="btn" disabled={respond.isPending} onClick={() => respond.mutate({ applicationId: r.applicationId, decision: 'deny' })}>Deny</button>
                    </>
                  )}
                  {actionable && confirmId === r.applicationId && (
                    <>
                      <span style={{ fontSize: 12 }}>Share your name &amp; contact with {r.company}?</span>
                      <button type="button" className="btn btn-primary" disabled={respond.isPending} onClick={() => { respond.mutate({ applicationId: r.applicationId, decision: 'grant' }); setConfirmId(null); }}>Confirm</button>
                      <button type="button" className="btn" disabled={respond.isPending} onClick={() => setConfirmId(null)}>Cancel</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>}
    </div>
  );
}
