import { useState } from 'react';

export interface RangeValue {
  from?: string;
  to?: string;
}

export interface RangeFilterProps {
  type: 'date' | 'number';
  value: RangeValue;
  onChange: (next: RangeValue) => void;
  onClear: () => void;
  close: () => void;
}

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Text for the FilterPopover trigger box: placeholder when empty, else a compact "from – to" summary. */
export function formatRangeSummary(value: RangeValue, placeholder: string): string {
  if (!value.from && !value.to) return placeholder;
  if (value.from && value.to) return `${value.from} – ${value.to}`;
  return value.from ? `≥ ${value.from}` : `≤ ${value.to}`;
}

// Popover body for a number/date range column filter. Edits are held in local draft state and only
// committed (via onChange) when "Apply" is clicked — this is what lets the trigger box + popover
// avoid the reflow-while-open problem a live-committing filter would have (the table only refetches
// after the popover has already closed).
export function RangeFilter({ type, value, onChange, onClear, close }: RangeFilterProps) {
  const [draft, setDraft] = useState<RangeValue>(value);
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  function apply() {
    onChange(draft);
    close();
  }
  function clear() {
    setDraft({});
    onClear();
    close();
  }

  if (type === 'number') {
    return (
      <>
        <input
          type="number"
          placeholder="Min"
          value={draft.from ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
        />
        <input
          type="number"
          placeholder="Max"
          value={draft.to ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
        />
        <div className="cf-actions">
          <button type="button" onClick={clear}>Clear</button>
          <button type="button" onClick={apply}>Apply</button>
        </div>
      </>
    );
  }

  const first = new Date(viewYear, viewMonth, 1);
  const startDow = first.getDay();
  const total = daysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array.from({ length: startDow }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];

  function isoFor(day: number): string {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function pick(day: number) {
    const iso = isoFor(day);
    setDraft((d) => {
      if (!d.from || d.to) return { from: iso, to: undefined };
      if (iso < d.from) return { from: iso, to: d.from };
      return { from: d.from, to: iso };
    });
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); } else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); } else setViewMonth((m) => m + 1);
  }

  return (
    <>
      <input type="date" value={draft.from ?? ''} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
      <input type="date" value={draft.to ?? ''} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
      <div className="cal">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <button type="button" className="cf-opt" style={{ width: 'auto', padding: '4px 6px' }} onClick={prevMonth}>
            <i className="ti ti-chevron-left" />
          </button>
          <b style={{ fontSize: 12.5 }}>{first.toLocaleString('en-US', { month: 'long', year: 'numeric' })}</b>
          <button type="button" className="cf-opt" style={{ width: 'auto', padding: '4px 6px' }} onClick={nextMonth}>
            <i className="ti ti-chevron-right" />
          </button>
        </div>
        <div className="cal-grid">
          {DOW.map((d) => <div className="dow" key={d}>{d}</div>)}
          {cells.map((day, i) => {
            if (day === null) return <div className="cal-cell mute" key={`e${i}`} />;
            const iso = isoFor(day);
            const picked = iso === draft.from || iso === draft.to;
            const inRange = !!(draft.from && draft.to && iso > draft.from && iso < draft.to);
            return (
              <div
                key={iso}
                className={`cal-cell${picked ? ' picked' : inRange ? ' inrange' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => pick(day)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(day); } }}
              >
                {day}
              </div>
            );
          })}
        </div>
      </div>
      <div className="cf-actions">
        <button type="button" onClick={clear}>Clear</button>
        <button type="button" onClick={apply}>Apply</button>
      </div>
    </>
  );
}
