import { useState } from 'react';
import type { PortalDrive } from '../../types/portal.js';
import { DriveSlots } from './DriveSlots.js';

const TAG_CLASS: Record<PortalDrive['statusTag'], string> = {
  Selected: 'tag selected', 'In progress': 'tag progress', Closed: 'tag closed',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function DrivesList({ drives }: { drives: PortalDrive[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  if (drives.length === 0) {
    return <div className="card portal-empty">You’re not eligible for any open drives yet. Check back soon.</div>;
  }

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="drive-list">
      {drives.map((d) => {
        const isOpen = open.has(d.id);
        return (
          <div key={d.id}>
            <div className="card drive">
              <div className="info">
                <b>{d.name}</b>
                <div className="meta">
                  {d.domain && <span><i className="ti ti-briefcase" /> {d.domain}</span>}
                  <span><i className="ti ti-building" /> {d.employers.length ? d.employers.join(', ') : '—'}</span>
                  {d.eventDates.length > 0 && <span><i className="ti ti-calendar" /> {d.eventDates.map(fmtDate).join(', ')}</span>}
                </div>
              </div>
              <span className={TAG_CLASS[d.statusTag]}>{d.statusTag}</span>
              <button type="button" className="btn" onClick={() => toggle(d.id)}>
                {isOpen ? 'Hide slots' : 'View slots'}
              </button>
            </div>
            {isOpen && <DriveSlots driveId={d.id} />}
          </div>
        );
      })}
    </div>
  );
}
