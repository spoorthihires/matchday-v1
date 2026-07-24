import { Link } from 'react-router-dom';
import { useEmployerPortal } from './hooks/useEmployerPortal.js';
import { formatRelativeTime } from './hooks/useEmployerNotifications.js';
import type { EmployerCalendarEntry } from '../../types/employer.js';
import './employerBase.js';

const NOTIF_TINT: Record<string, string> = { registration: 'ni-ok', candidate: 'ni-cand', slot: 'ni-warn' };

// Ported from the prototype Matchday_Employer.html lines ~2705-2790 (view-app's
// #page-dashboard: .dash-greet header, .kpi-grid, and the .dash-cols two-column card
// layout). Renders inside EmployerShell's ".page active" content area (App.tsx), which
// already provides the ".employer-app" CSS scope — this component intentionally does NOT
// re-wrap in ".employer-app" (only ".page-wrap", matching the prototype's inner markup).
//
// The prototype's dashboard is richer than this slice's data (an 8-tile KPI grid, a hiring
// funnel, an interactive month-grid calendar, pending actions, recent notifications) — the
// live hook only returns { kpis: {activeDrives, upcomingInterviews, totalSlots}, calendar,
// registrations, shortlist }. So this ports the greeting/kpi-grid/card/dash-cols scaffolding
// faithfully but: (1) renders exactly the 3 KPIs the API provides instead of 8 demo tiles,
// (2) simplifies "MatchDay calendar" to a plain upcoming-interviews list (no month grid —
// there's no month/booked-Wednesday data to drive one), and (3) adds registrations/shortlist
// cards with empty-state copy since those arrays are placeholders this slice (Slice 3/6 fill
// them in). The "Pending review" banner has no prototype dashboard equivalent (the prototype
// has no signup-approval gate) — it reuses the amber ".rd-banner cr" notice style ported
// elsewhere in employer.css for visual consistency.

function formatCalendarEntry(entry: EmployerCalendarEntry): string {
  const date = new Date(entry.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${date} · ${entry.start}–${entry.end}`;
}

export function EmployerDashboard() {
  const { data, isLoading, isError, error } = useEmployerPortal();

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
                access to drives and candidates once it&apos;s approved.
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
                    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
                  </svg>
                </span>
                <span className="klabel">Active drives</span>
              </div>
              <div className="kn">{data.dashboard.kpis.activeDrives}</div>
            </div>

            <div className="kpi">
              <div className="ktop">
                <span className="kic">
                  <svg className="ic ic-sm" viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /><path d="M9 15l2 2 4-4" />
                  </svg>
                </span>
                <span className="klabel">Upcoming interviews</span>
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
          </div>

          <div className="dash-cols">
            <div className="dash-col">
              <div className="card">
                <div className="card-head">
                  <h3>
                    <svg className="ic ic-sm" viewBox="0 0 24 24">
                      <path d="M9 5h6M9 5a2 2 0 00-2 2v0a2 2 0 002 2h6a2 2 0 002-2v0a2 2 0 00-2-2M7 7H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-2" />
                    </svg>
                    Registrations
                  </h3>
                </div>
                <div className="card-body">
                  {data.dashboard.registrations.length === 0 ? (
                    <p className="hint">No registrations yet — they&apos;ll appear here once you register for a drive.</p>
                  ) : (
                    <p className="hint">{data.dashboard.registrations.length} registration(s).</p>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <h3>
                    <svg className="ic ic-sm" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0112 0" /></svg>
                    Shortlist
                  </h3>
                </div>
                <div className="card-body">
                  {data.dashboard.shortlist.length === 0 ? (
                    <p className="hint">No shortlisted candidates yet — they&apos;ll show up here once you shortlist someone from a drive.</p>
                  ) : (
                    <p className="hint">{data.dashboard.shortlist.length} jobseeker(s).</p>
                  )}
                </div>
              </div>
            </div>

            <div className="dash-col">
              <div className="card">
                <div className="card-head">
                  <h3>
                    <svg className="ic ic-sm" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /></svg>
                    Upcoming interviews
                  </h3>
                </div>
                <div className="card-body">
                  {data.dashboard.calendar.length === 0 ? (
                    <p className="hint">No upcoming interviews scheduled.</p>
                  ) : (
                    data.dashboard.calendar.map((entry) => (
                      <div className="drive-row" key={entry.id}>
                        <div>
                          <div className="dn">{formatCalendarEntry(entry)}</div>
                          <div className="dm">Drive {entry.driveId}</div>
                        </div>
                      </div>
                    ))
                  )}
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
