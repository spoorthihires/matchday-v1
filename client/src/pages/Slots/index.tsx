import { useState } from 'react';
import { AppShell } from '../../components/AppShell.js';
import { useEmployers } from '../Employers/hooks/useEmployers.js';
import type { SlotItem } from '../../types/slots.js';
import { DOW_FULL, MON, parseYmd, slotDayKey, visibleRange, ymd } from './calendarUtils.js';
import { MonthView } from './MonthView.js';
import { WeekView } from './WeekView.js';
import { DayView, type SlotActionKind } from './DayView.js';
import { useSlots } from './hooks/useSlots.js';

type View = 'month' | 'week' | 'day';

// TODO(Task 6): these record *intent*; SlotModal/SlotActionModal will render below when non-null
// (mirrors EmployersPage's `modal` state pattern). Nothing renders from them yet.
type ModalState = { mode: 'create'; date: string } | { mode: 'edit'; slot: SlotItem } | null;
type ActionModalState = { kind: 'link' | 'resch' | 'noshow'; slot: SlotItem } | null;

// Self-wraps in AppShell (mirroring Employers/Institutes/Jobseekers) — App.tsx must mount this
// directly under ProtectedRoute with no outer AppShell of its own.
export function SlotsPage() {
  const [view, setView] = useState<View>('month');
  const [refDate, setRefDate] = useState<Date>(() => new Date());
  const [employerId, setEmployerId] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  // TODO(Task 6): `actionModal` will be set by Day view's quick-action buttons (Task 5) and
  // consumed by <SlotActionModal>; nothing sets or renders it yet, so it's declared but idle.
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
    // TODO(Task 6): open SlotModal in edit mode.
    setModal({ mode: 'edit', slot });
  }
  function handleMoreClick(dateKey: string) {
    setView('day');
    setRefDate(parseYmd(dateKey));
  }
  function handleCellClick(dateKey: string) {
    // TODO(Task 6): open SlotModal in create mode, pre-dated to dateKey.
    setModal({ mode: 'create', date: dateKey });
  }
  function handleCreate() {
    // TODO(Task 6): open SlotModal in create mode, pre-dated to the current refDate.
    setModal({ mode: 'create', date: ymd(refDate) });
  }
  function handleSlotAction(kind: SlotActionKind, slot: SlotItem) {
    if (kind === 'edit') {
      // TODO(Task 6): open SlotModal in edit mode.
      setModal({ mode: 'edit', slot });
      return;
    }
    // TODO(Task 6): open SlotActionModal for link/reschedule/no-shows.
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

        {/* TODO(Task 6): render <SlotModal> when `modal` is non-null and <SlotActionModal> when
            `actionModal` is non-null; wire onClose={() => setModal(null)} / setActionModal(null). */}
      </div>
    </AppShell>
  );
}
