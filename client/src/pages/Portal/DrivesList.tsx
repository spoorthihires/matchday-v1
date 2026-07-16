import type { PortalDrive } from '../../types/portal.js';

const TAG_CLASS: Record<PortalDrive['statusTag'], string> = {
  Selected: 'tag selected', 'In progress': 'tag progress', Closed: 'tag closed',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function DrivesList({ drives }: { drives: PortalDrive[] }) {
  if (drives.length === 0) {
    return <div className="card portal-empty">You’re not eligible for any open drives yet. Check back soon.</div>;
  }
  return (
    <div className="drive-list">
      {drives.map((d) => (
        <div key={d.id} className="card drive">
          <div className="info">
            <b>{d.name}</b>
            <div className="meta">
              {d.domain && <span><i className="ti ti-briefcase" /> {d.domain}</span>}
              <span><i className="ti ti-building" /> {d.employers.length ? d.employers.join(', ') : '—'}</span>
              {d.eventDates.length > 0 && <span><i className="ti ti-calendar" /> {d.eventDates.map(fmtDate).join(', ')}</span>}
            </div>
          </div>
          <span className={TAG_CLASS[d.statusTag]}>{d.statusTag}</span>
        </div>
      ))}
    </div>
  );
}
