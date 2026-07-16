import { useAuth } from '../../auth/AuthContext.js';
import { usePortal } from '../../hooks/usePortal.js';
import { DrivesList } from './DrivesList.js';
import { JourneyPipeline } from './JourneyPipeline.js';
import { PortalShell } from './PortalShell.js';
import { StatusCards } from './StatusCards.js';
import './portal.css';

export function Portal() {
  const { user } = useAuth();
  const { data, isLoading, isError, error } = usePortal();
  return (
    <PortalShell name={user?.name ?? 'Jobseeker'}>
      {isLoading && <div className="card" style={{ padding: 20, color: 'var(--muted)' }}>Loading your dashboard…</div>}
      {isError && (
        <div className="card" style={{ padding: 20, color: 'var(--danger)' }}>
          Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}
      {data && (
        <>
          <div className="portal-hero">
            <h1>Hi, {data.profile.name.split(' ')[0]}</h1>
            <div className="sub">
              {data.profile.code} · {data.profile.branch} · {data.profile.institute} · Class of {data.profile.gradYear}
            </div>
          </div>
          <JourneyPipeline journey={data.journey} />
          <StatusCards journey={data.journey} />
          <div>
            <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>My Drives</h2>
            <DrivesList drives={data.drives} />
          </div>
        </>
      )}
    </PortalShell>
  );
}
