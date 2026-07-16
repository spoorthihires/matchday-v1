import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppShell } from '../../components/AppShell.js';
import { useEmployers } from '../Employers/hooks/useEmployers.js';
import type { SlotItem } from '../../types/slots.js';
import { DOW_FULL, MON, parseYmd, slotDayKey, visibleRange, ymd } from './calendarUtils.js';
import { MonthView } from './MonthView.js';
import { WeekView } from './WeekView.js';
import { DayView, type SlotActionKind } from './DayView.js';
import { useSlots } from './hooks/useSlots.js';
import { SlotModal } from './SlotModal.js';
import { SlotActionModal } from './SlotActionModal.js';

type View = 'month' | 'week' | 'day';

// Mirrors EmployersPage's `modal` state pattern — rendered below via <SlotModal>/<SlotActionModal>.
type ModalState = { mode: 'create'; date: string } | { mode: 'edit'; slot: SlotItem } | null;
type ActionModalState = { kind: 'link' | 'resch' | 'noshow'; slot: SlotItem } | null;

// Self-wraps in AppShell (mirroring Employers/Institutes/Jobseekers) — App.tsx must mount this
// directly under ProtectedRoute with no outer AppShell of its own.
export function SlotsPage() {
  const [view, setView] = useState<View>('month');
  const [refDate, setRefDate] = useState<Date>(() => new Date());
  const [searchParams] = useSearchParams();
  const [employerId, setEmployerId] = useState(() => searchParams.get('employerId') ?? '');
  const [modal, setModal] = useState<ModalState>(null);
  // Set by Day view's quick-action buttons (Task 5) and consumed by <SlotActionModal> below.
  const [actionModal, setActionModal] = useState<ActionModalState>(null);

  const { from, to } = visibleRange(view, refDate);
  const { data, isLoading, isError, error } = useSlots({ from, to, employerId });
  const { data: employersData } = useEmployers({ limit: 100 });

  const slots = data?.items ?? [];
  // Slot lookup helper — items whose canonical day key (see calendarUtils.ts's `slotDayKey`)
  // matches. MonthView filters `slots` itself per-cell; this is for the Week/Day views (Task 5).
  function slotsOn(dateStr: string): SlotItem[] {
    return slots
      .filter((s) => slotDayKey(s.date) === dateStr)
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  function step(dir: 1 | -1) {
    setRefDate((d) => {
      const next = new Date(d);
      if (view === 'month') next.setMonth(next.getMonth() + dir);
      else next.setDate(next.getDate() + dir * (view === 'week' ? 7 : 1));
      return next;
    });
  }

  function calTitle(): string {
    if (view === 'month') return `${MON[refDate.getMonth()]} ${refDate.getFullYear()}`;
    if (view === 'week') {
      const start = new Date(refDate);
      start.setDate(refDate.getDate() - refDate.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `${MON[start.getMonth()].slice(0, 3)} ${start.getDate()} – ${MON[end.getMonth()].slice(0, 3)} ${end.getDate()}, ${end.getFullYear()}`;
    }
    return `${DOW_FULL[refDate.getDay()]}, ${MON[refDate.getMonth()]} ${refDate.getDate()}, ${refDate.getFullYear()}`;
  }

  function handleChipClick(slot: SlotItem) {
    setModal({ mode: 'edit', slot });
  }
  function handleMoreClick(dateKey: string) {
    setView('day');
    setRefDate(parseYmd(dateKey));
  }
  function handleCellClick(dateKey: string) {
    setModal({ mode: 'create', date: dateKey });
  }
  function handleCreate() {
    setModal({ mode: 'create', date: ymd(refDate) });
  }
  function handleSlotAction(kind: SlotActionKind, slot: SlotItem) {
    if (kind === 'edit') {
      setModal({ mode: 'edit', slot });
      return;
    }
    setActionModal({ kind, slot });
  }

  const daySlots = slotsOn(ymd(refDate));

  return (
    <AppShell crumb="Demand" title="Slot Calendar">
      <div className="content">
        <div className="dm-toolbar">
          <div className="calseg">
            <button className={view === 'month' ? 'on' : undefined} onClick={() => setView('month')}>Month</button>
            <button className={view === 'week' ? 'on' : undefined} onClick={() => setView('week')}>Week</button>
            <button className={view === 'day' ? 'on' : undefined} onClick={() => setView('day')}>Day</button>
          </div>
          <div className="cal-nav">
            <button className="navbtn" aria-label="Previous" onClick={() => step(-1)}>
              <i className="ti ti-chevron-left" />
            </button>
            <button className="btn btn-ghost" onClick={() => setRefDate(new Date())}>Today</button>
            <button className="navbtn" aria-label="Next" onClick={() => step(1)}>
              <i className="ti ti-chevron-right" />
            </button>
          </div>
          <div className="cal-title">{calTitle()}</div>
          <div className="grow" />
          <select
            className="select"
            style={{ appearance: 'auto' }}
            aria-label="Filter by employer"
            value={employerId}
            onChange={(e) => setEmployerId(e.target.value)}
          >
            <option value="">All employers</option>
            {(employersData?.items ?? []).map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={handleCreate}>
            <i className="ti ti-plus" /> Create Slot
          </button>
        </div>

        {isError && (
          <div className="card">
            <p style={{ padding: '20px', color: 'var(--danger)' }}>
              Failed to load slots: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        )}
        {isLoading && <div className="dm-empty" style={{ padding: 20 }}>Loading slots…</div>}

        {!isLoading && view === 'month' && (
          <MonthView
            refDate={refDate}
            slots={slots}
            onChipClick={handleChipClick}
            onMoreClick={handleMoreClick}
            onCellClick={handleCellClick}
          />
        )}
        {!isLoading && view === 'week' && (
          <WeekView
            refDate={refDate}
            slots={slots}
            onSlotClick={handleChipClick}
            onDayClick={handleMoreClick}
          />
        )}
        {!isLoading && view === 'day' && (
          <DayView slots={daySlots} onAction={handleSlotAction} />
        )}

        {modal && (
          <SlotModal
            mode={modal.mode}
            date={modal.mode === 'create' ? modal.date : undefined}
            slot={modal.mode === 'edit' ? modal.slot : undefined}
            onClose={() => setModal(null)}
          />
        )}
        {actionModal && (
          <SlotActionModal
            kind={actionModal.kind}
            slot={actionModal.slot}
            onClose={() => setActionModal(null)}
          />
        )}
      </div>
    </AppShell>
  );
}
