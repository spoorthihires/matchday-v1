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
  return (
    <AppShell crumb="Overview" title="Command Center">
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
