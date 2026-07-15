import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell.js';
import { useDashboardOverview } from '../../hooks/useDashboardOverview.js';
import { FunnelsSection } from './FunnelsSection.js';
import { KpiSection } from './KpiSection.js';
import { LeaderboardsSection } from './LeaderboardsSection.js';
import { ReadinessHero } from './ReadinessHero.js';
import { ScheduleSection } from './ScheduleSection.js';

// Self-wraps in AppShell (mirroring ComingSoon.tsx) — App.tsx must mount
// this directly under ProtectedRoute with no outer AppShell of its own.
export function Dashboard() {
  const { data, isLoading, isError, error } = useDashboardOverview();
  const navigate = useNavigate();
  return (
    <AppShell crumb="Overview" title="Command Center">
      {/*
        Ported from matchday-admin-app_23.html's `.filters` toolbar (lines ~1132-1140) — just the
        "New Drive" button (#newDriveTop), which there opens Drive Management then the create
        wizard (`goPage('drives');setTimeout(openWizard,120)`). The other filter selects in that
        toolbar are decorative-only in the prototype (no wiring) and out of scope here, so this
        only ports the one functional control: navigate to the Drives list with `?new=1`, which
        DrivesPage reads on mount to open the create wizard.
      */}
      <div className="filters">
        <div className="grow" />
        <button className="btn btn-primary" onClick={() => navigate('/drives?new=1')}>
          <i className="ti ti-plus" /> New Drive
        </button>
      </div>
      <div className="content">
        {isLoading && (
          <div className="card"><p style={{ padding: '20px', color: 'var(--muted)' }}>Loading dashboard…</p></div>
        )}
        {isError && (
          <div className="card">
            <p style={{ padding: '20px', color: 'var(--danger)' }}>
              Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        )}
        {data && (
          <>
            <ReadinessHero readiness={data.readiness} />
            <KpiSection kpis={data.kpis} />
            <FunnelsSection funnels={data.funnels} />
            <ScheduleSection schedule={data.schedule} slot={data.slotUtilization} />
            <LeaderboardsSection leaderboards={data.leaderboards} />
          </>
        )}
      </div>
    </AppShell>
  );
}
