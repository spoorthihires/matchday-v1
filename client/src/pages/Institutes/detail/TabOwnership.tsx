import type { OwnershipEntry } from '../../../types/institutes.js';

// Ported from matchday-admin-app_23.html renderIdOwnership() (lines ~3938-3941): a `.card`
// wrapping a `.timeline` of ownership changes. The prototype hardcodes 2-3 sample entries and a
// "Transfer" action button (`#idTransfer2` → `transferOwnership()`, a mock); transferring
// ownership isn't part of this build's API, so that button is omitted here. Instead the timeline
// is built from the institute's real `ownershipHistory` (appended chronologically, oldest first,
// by institutes.service.ts#createInstitute/updateInstitute), reversed so the current owner shows
// first with the same "(current)" framing as the prototype.

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function TabOwnership({ ownershipHistory }: { ownershipHistory: OwnershipEntry[] }) {
  const entries = [...ownershipHistory].reverse();

  return (
    <div className="card">
      <div className="card-h">
        <div>
          <h3>Ownership history</h3>
          <div className="sub">Chronological record of SPOC changes</div>
        </div>
      </div>
      <div style={{ padding: '4px 20px 18px' }}>
        {entries.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No ownership changes recorded yet.</p>
        ) : (
          <div className="timeline">
            {entries.map((h, idx) => (
              <div className="tl-item" key={`${h.changedAt}-${idx}`}>
                <span className="tl-dot"><i className={`ti ${idx === 0 ? 'ti-user-check' : 'ti-transfer'}`} /></span>
                <div className="tl-b">
                  <b>{h.owner}{idx === 0 ? ' (current)' : ''}</b>
                  <span>{h.email} · {fmtDate(h.changedAt)} · by {h.changedBy}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
