import { Link } from 'react-router-dom';
import { useEmployerPortal } from './hooks/useEmployerPortal.js';
import { useEmployerReports } from './hooks/useEmployerReports.js';
import { formatRelativeTime } from './hooks/useEmployerNotifications.js';
import type { EmployerPendingAction } from '../../types/employer.js';
import './employerBase.js';

const NOTIF_TINT: Record<string, string> = { registration: 'ni-ok', candidate: 'ni-cand', slot: 'ni-warn' };

// Ported from the prototype MatchDay_Employer_V1.html's #page-dashboard (~2690-2760) for the
// V1 dashboard rebuild (Task 2, off Task 1's extended `dashboard` aggregate). Keeps the
// greeting/Pending-review-banner scaffolding from the original slice-1 port, but replaces the
// 3-tile KPI block + registrations/shortlist/upcoming-interviews placeholder cards with the
// prototype's real layout: an 8-tile `.kpi-grid` (no `.kdelta` -- the brief drops the
// week-over-week delta line since the live data has no history to compute one from), a Hiring
// funnel card (sourced from the reports endpoint, reused via useEmployerReports('all') -- the
// same hook EmployerReports.tsx uses), an Active drives card (from `dashboard.activeDrives`),
// and a Pending actions card (from `dashboard.pendingActions`). The prototype's "MatchDay
// calendar" widget (an interactive month grid) is intentionally NOT built here -- that's Task 3;
// this leaves a thin placeholder card in its slot so Task 3 has an obvious drop-in point,
// and keeps the existing Recent notifications card below it in the right column.

// Active-drive status -> status-pill badge class. Mirrors EmployerRegistrations.tsx's
// STATUS_BADGE_CLASS mapping verbatim (same RegistrationRequest.status enum this dashboard's
// `dashboard.activeDrives[].status` is sourced from server-side: 'Pending review' | 'Approved' |
// 'Rejected' | 'Changes requested') rather than inventing a parallel taxonomy.
const DRIVE_STATUS_CLASS: Record<string, string> = {
  'Pending review': 'st-inprog',
  Approved: 'st-approved',
  Rejected: 'st-cancelled',
  'Changes requested': 'st-cr',
};
function driveStatusClass(status: string): string {
  return DRIVE_STATUS_CLASS[status] ?? 'st-draft';
}

// Pending-action kind -> destination route + button label. The server only emits 'register'
// (registration awaiting admin review) and 'slot'/'shortlist' (post-approval follow-ups) today,
// but all three are handled per the type's full enum.
const ACTION_ROUTE: Record<EmployerPendingAction['kind'], string> = {
  register: '/employer/registrations',
  slot: '/employer/registrations',
  shortlist: '/employer/drives',
};
const ACTION_LABEL: Record<EmployerPendingAction['kind'], string> = {
  register: 'View',
  slot: 'Book slot',
  shortlist: 'Shortlist',
};

function actionGlyph(urgency: EmployerPendingAction['urgency']) {
  if (urgency === 'over') return <><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></>;
  if (urgency === 'today') return <><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></>;
  return <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>;
}
function actionDueLabel(urgency: EmployerPendingAction['urgency']): string {
  if (urgency === 'over') return 'Overdue';
  if (urgency === 'today') return 'Due today';
  return 'Coming up';
}
function actionDueClass(urgency: EmployerPendingAction['urgency']): string {
  if (urgency === 'over') return 'due-over';
  if (urgency === 'today') return 'due-today';
  return '';
}

function funnelPct(count: number, base: number): number {
  return base > 0 ? Math.round((count / base) * 100) : 0;
}

function formatDriveDate(iso: string | null): string {
  if (!iso) return 'Date TBD';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Date TBD';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function EmployerDashboard() {
  const { data, isLoading, isError, error } = useEmployerPortal();
  const reports = useEmployerReports('all');

  // Reports is a separate query from the portal aggregate -- default to zeros while it's
  // loading (or if it errors) so the KPI grid / funnel never crash on undefined data.
  const funnel = reports.data?.funnel ?? [];
  const repKpis = reports.data?.kpis ?? {
    recommended: 0, shortlisted: 0, interviewsScheduled: 0, offersSent: 0, offersAccepted: 0, dropOffPct: 0, avgMatchScore: 0,
  };
  const funnelBase = funnel[0]?.count ?? 0;
  const joined = funnel.length > 0 ? funnel[funnel.length - 1].count : repKpis.offersAccepted;

  return (
    <div className="page-wrap">
      {isLoading && (
        <div className="card" style={{ padding: 20, color: 'var(--grey)' }}>Loading your dashboard…</div>
      )}
      {isError && (
        <div className="card" style={{ padding: 20, color: '#e0463c' }}>
          Failed to load your dashboard: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {data && (
        <>
          {data.profile.status === 'Pending' && (
            <div className="rd-banner cr" role="status" style={{ marginLeft: 0, marginRight: 0 }}>
              <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M12 8v4M12 16h.01" /><circle cx="12" cy="12" r="9" /></svg>
              <span>
                <b>Pending review.</b> Your employer account is awaiting admin approval. You&apos;ll get full
                access to drives and jobseekers once it&apos;s approved.
              </span>
            </div>
          )}

          <div className="dash-greet">
            <h2>Welcome back, {data.profile.spoc || data.profile.name}</h2>
            <p>Here&apos;s what&apos;s happening across your MatchDay hiring this week.</p>
          </div>

          <div className="kpi-grid">
            <div className="kpi">
              <div className="ktop">
                <span className="kic">
                  <svg className="ic ic-sm" viewBox="0 0 24 24">
                    <path d="M9 5h6M7 7H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-2" /><path d="M9 3h6a2 2 0 010 4H9a2 2 0 010-4z" />
                  </svg>
                </span>
                <span className="klabel">Active registrations</span>
              </div>
              <div className="kn">{data.dashboard.kpis.activeRegistrations}</div>
            </div>

            <div className="kpi">
              <div className="ktop">
                <span className="kic">
                  <svg className="ic ic-sm" viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" />
                  </svg>
                </span>
                <span className="klabel">Upcoming MatchDays</span>
              </div>
              <div className="kn">{data.dashboard.kpis.upcomingMatchDays}</div>
            </div>

            <div className="kpi">
              <div className="ktop">
                <span className="kic">
                  <svg className="ic ic-sm" viewBox="0 0 24 24">
                    <circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0112 0" /><path d="M16 6a3 3 0 010 6" />
                  </svg>
                </span>
                <span className="klabel">Jobseekers shared</span>
              </div>
              <div className="kn">{repKpis.recommended}</div>
            </div>

            <div className="kpi">
              <div className="ktop">
                <span className="kic">
                  <svg className="ic ic-sm" viewBox="0 0 24 24">
                    <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                  </svg>
                </span>
                <span className="klabel">Shortlisted</span>
              </div>
              <div className="kn">{repKpis.shortlisted}</div>
            </div>

            <div className="kpi">
              <div className="ktop">
                <span className="kic">
                  <svg className="ic ic-sm" viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /><path d="M9 15l2 2 4-4" />
                  </svg>
                </span>
                <span className="klabel">Interviews scheduled</span>
              </div>
              <div className="kn">{data.dashboard.kpis.upcomingInterviews}</div>
            </div>

            <div className="kpi">
              <div className="ktop">
                <span className="kic">
                  <svg className="ic ic-sm" viewBox="0 0 24 24">
                    <rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="14" rx="1" />
                  </svg>
                </span>
                <span className="klabel">Total slots</span>
              </div>
              <div className="kn">{data.dashboard.kpis.totalSlots}</div>
            </div>

            <div className="kpi">
              <div className="ktop">
                <span className="kic">
                  <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>
                </span>
                <span className="klabel">Offers sent</span>
              </div>
              <div className="kn">{repKpis.offersSent}</div>
            </div>

            <div className="kpi">
              <div className="ktop">
                <span className="kic">
                  <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 16.6 5.7 21l2.3-7.2-6-4.4h7.6z" /></svg>
                </span>
                <span className="klabel">Joined</span>
              </div>
              <div className="kn">{joined}</div>
            </div>
          </div>

          <div className="dash-cols">
            <div className="dash-col">
              <div className="card">
                <div className="card-head">
                  <h3>
                    <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M3 4h18l-7 8v6l-4 2v-8z" /></svg>
                    Hiring funnel
                  </h3>
                  <Link className="more" to="/employer/reports">
                    View reports <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </Link>
                </div>
                <div className="card-body">
                  {funnel.length === 0 || funnelBase === 0 ? (
                    <p className="hint">No pipeline data yet — the funnel fills in once you share jobseekers for a drive.</p>
                  ) : (
                    funnel.map((f) => {
                      const pct = funnelPct(f.count, funnelBase);
                      return (
                        <div className="funnel-row" key={f.stage}>
                          <span className="flbl">{f.stage}</span>
                          <span className="ftrack">
                            <span className="ffill" style={{ width: `${Math.max(pct, 8)}%` }}>{f.count}</span>
                          </span>
                          <span className="fpct">{pct}%</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <h3>
                    <svg className="ic ic-sm" viewBox="0 0 24 24">
                      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
                      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
                    </svg>
                    Active drives
                  </h3>
                  <Link className="more" to="/employer/registrations">
                    All registrations <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </Link>
                </div>
                <div className="card-body">
                  {data.dashboard.activeDrives.length === 0 ? (
                    <p className="hint">No active drives yet — register for a drive to see it here.</p>
                  ) : (
                    data.dashboard.activeDrives.map((d) => (
                      <div className="drive-row" key={d.id}>
                        <span className="drive-ic">
                          <svg className="ic" viewBox="0 0 24 24"><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 4-5" /></svg>
                        </span>
                        <div>
                          <div className="dn">{d.name}</div>
                          <div className="dm">{formatDriveDate(d.primaryEventDate)}</div>
                        </div>
                        <div className="dmeta">
                          <span className={`status-pill ${driveStatusClass(d.status)}`}>{d.status}</span>
                          <div className="dcount">{d.sharedCount} shared</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <h3>
                    <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></svg>
                    Pending actions
                  </h3>
                  <span className="status-pill st-short">{data.dashboard.pendingActions.length} to do</span>
                </div>
                <div className="card-body">
                  {data.dashboard.pendingActions.length === 0 ? (
                    <p className="hint">You&apos;re all caught up 🎉</p>
                  ) : (
                    data.dashboard.pendingActions.map((a) => (
                      <div className="action-row" key={a.id}>
                        <span className={`action-ic a-${a.urgency}`}>
                          <svg className="ic ic-sm" viewBox="0 0 24 24">{actionGlyph(a.urgency)}</svg>
                        </span>
                        <div>
                          <div className="at">{a.text}</div>
                          <div className={`ad ${actionDueClass(a.urgency)}`}>{actionDueLabel(a.urgency)}</div>
                        </div>
                        <Link className="action-btn" to={ACTION_ROUTE[a.kind]}>{ACTION_LABEL[a.kind]}</Link>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="dash-col">
              <div className="card">
                <div className="card-head">
                  <h3>
                    <svg className="ic ic-sm" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /></svg>
                    MatchDay calendar
                  </h3>
                </div>
                <div className="card-body">
                  <p className="hint">The full calendar view is coming soon.</p>
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <h3>
                    <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></svg>
                    Recent notifications
                  </h3>
                  <Link to="/employer/notifications" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--indigo)' }}>See all</Link>
                </div>
                <div className="card-body">
                  {data.dashboard.notifications.length === 0 ? (
                    <p className="hint">No notifications yet.</p>
                  ) : (
                    data.dashboard.notifications.map((n) => (
                      <div className="notif-row" key={n.id}>
                        <span className={`notif-ic ${NOTIF_TINT[n.category] ?? 'ni-cand'}`}>
                          <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" /></svg>
                        </span>
                        <div>
                          <div className="nt">{n.title} — {n.body}</div>
                          <div className="ntime">{formatRelativeTime(n.at)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
