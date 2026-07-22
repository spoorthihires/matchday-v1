import { useState } from 'react';
import { useOffers, useRespondOffer } from '../../hooks/useActivity.js';

function tagClass(value: string): string {
  const s = value.toLowerCase();
  if (s === 'accepted') return 'tag selected';
  if (s === 'declined' || s === 'withdrawn') return 'tag closed';
  return 'tag progress';
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtCtc(ctc: number): string {
  return ctc ? `₹${ctc.toLocaleString('en-IN')}` : '—';
}

export function Offers() {
  const q = useOffers();
  const respond = useRespondOffer();
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const items = q.data?.items ?? [];

  function accept(applicationId: string) {
    respond.mutate({ applicationId, response: 'Accepted' });
  }
  function startDecline(applicationId: string) {
    setDecliningId(applicationId);
    setReason('');
  }
  function submitDecline(applicationId: string) {
    respond.mutate({ applicationId, response: 'Declined', declineReason: reason || undefined });
    setDecliningId(null);
    setReason('');
  }

  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>My offers</h2>
      {q.isLoading ? <div className="card" style={{ padding: 16, color: 'var(--muted)' }}>Loading…</div>
        : items.length === 0 ? <div className="portal-empty">No offers yet.</div>
        : <div className="drive-list">
          {items.map((o) => {
            const actionable = o.status === 'Sent' && o.response === 'Pending';
            return (
              <div className="drive" key={o.applicationId}>
                <div className="info">
                  <b>{o.company}</b>
                  <div className="meta">
                    <span>{o.driveName}</span>
                    <span>{fmtCtc(o.ctc)}</span>
                    <span>{o.location}</span>
                    <span>{o.mode}</span>
                    <span>Joining {fmtDate(o.joinDate)}</span>
                  </div>
                </div>
                <div className="meta" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span className={tagClass(o.status)}>{o.status}</span>
                  <span className={tagClass(o.response)}>{o.response}</span>
                  {actionable && decliningId !== o.applicationId && (
                    <>
                      <button type="button" className="btn" disabled={respond.isPending} onClick={() => accept(o.applicationId)}>Accept</button>
                      <button type="button" className="btn" disabled={respond.isPending} onClick={() => startDecline(o.applicationId)}>Decline</button>
                    </>
                  )}
                  {actionable && decliningId === o.applicationId && (
                    <>
                      <input
                        type="text"
                        className="offer-reason-input"
                        placeholder="Reason (optional)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                      <button type="button" className="btn" disabled={respond.isPending} onClick={() => submitDecline(o.applicationId)}>Confirm decline</button>
                      <button type="button" className="btn" disabled={respond.isPending} onClick={() => setDecliningId(null)}>Cancel</button>
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
