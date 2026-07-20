import { useEmployerRegistrations } from './hooks/useEmployerRegistrations.js';
import type { EmployerRegistrationItem } from '../../types/employer.js';
import './employerBase.js';

// Ported from the prototype Matchday_Employer.html's #page-registrations (~3140-3157) and its
// renderRegistrations() card template (~5231-5246): reuses the .dash-greet header, the
// .reg-list/.reg-card/.rc-top/.rc-name/.rc-role/.rc-foot scaffolding, and the .status-pill
// badge classes verbatim. Renders inside EmployerShell's ".page active" content area
// (App.tsx), which already provides the ".employer-app" CSS scope -- this component
// intentionally does NOT re-wrap in ".employer-app" (only ".page-wrap"), matching the
// convention set by EmployerDashboard.tsx/EmployerDrives.tsx.
//
// The prototype's tracker is a master-detail view (a reg-list + a reg-detail timeline panel)
// keyed off its own much richer status taxonomy (Draft/Submitted/Slot Booked/Candidate
// Matching In Progress/.../Completed/Cancelled) with mini-step progress bars and reference IDs
// (REG-2043 etc.). This slice's live GET /me/employer/registrations (Task 2) instead returns
// the simpler real shape -- { id, driveId, driveName, role, openings, status, submittedAt,
// latestActivity } -- with the server's own status enum: 'Pending review' | 'Approved' |
// 'Rejected' | 'Changes requested'. This task's scope (per the Task 4 brief) is the list only
// (no detail route yet, no click-through), so it ports the reg-card row shape (name/role+
// openings/status pill/foot meta row) without the reference id, mini-steps, or detail panel.
//
// Status -> badge class mapping: reuses the prototype's existing .status-pill variants
// (employer.css ~1234-1240) rather than inventing new ones. 'Approved' matches the
// prototype's own 'Approved' key exactly (st-approved). 'Changes requested' matches the
// prototype's 'Changes Requested' key (st-cr, amber) modulo casing. 'Pending review' has no
// exact prototype counterpart -- it is the same "submitted, awaiting admin action" moment as
// the prototype's 'Submitted' status, so it reuses that status's class (st-inprog, indigo).
// 'Rejected' has no exact prototype counterpart either -- it is a terminal negative outcome
// like the prototype's 'Cancelled', so it reuses that class (st-cancelled, red). Any
// unrecognised status falls back to the neutral st-draft class rather than going unstyled.
const STATUS_BADGE_CLASS: Record<string, string> = {
  'Pending review': 'st-inprog',
  Approved: 'st-approved',
  Rejected: 'st-cancelled',
  'Changes requested': 'st-cr',
};

function badgeClass(status: string): string {
  return STATUS_BADGE_CLASS[status] ?? 'st-draft';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function RegistrationCard({ item }: { item: EmployerRegistrationItem }) {
  return (
    <div className="reg-card">
      <div className="rc-top">
        <div style={{ minWidth: 0 }}>
          <div className="rc-name">{item.driveName}</div>
          <div className="rc-role">{item.role} · {item.openings} opening{item.openings === 1 ? '' : 's'}</div>
        </div>
        <span className={`status-pill ${badgeClass(item.status)}`}>{item.status}</span>
      </div>
      <div className="rc-foot">
        <span>Submitted {formatDate(item.submittedAt)}</span>
        <span>{item.latestActivity}</span>
      </div>
    </div>
  );
}

export function EmployerRegistrations() {
  const { data, isLoading, isError, error } = useEmployerRegistrations();
  const items = data?.items ?? [];

  return (
    <div className="page-wrap">
      <div className="dash-greet">
        <h2>Registration tracker</h2>
        <p>Follow every drive you&apos;ve registered for through its status lifecycle.</p>
      </div>

      {isLoading && (
        <div className="card" style={{ padding: 20, color: 'var(--grey)' }}>Loading registrations…</div>
      )}
      {isError && (
        <div className="card" style={{ padding: 20, color: '#e0463c' }}>
          Failed to load registrations: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {data && (
        items.length === 0 ? (
          <div className="rt-empty">
            <div className="re-ic">
              <svg className="ic ic-lg" viewBox="0 0 24 24">
                <path d="M9 5h6M7 7H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-2" />
                <path d="M9 3h6a2 2 0 010 4H9a2 2 0 010-4z" />
              </svg>
            </div>
            <h3>No registrations yet</h3>
            <p>Register for a drive and it&apos;ll appear here.</p>
          </div>
        ) : (
          <div className="reg-list">
            {items.map((item) => (
              <RegistrationCard key={item.id} item={item} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
