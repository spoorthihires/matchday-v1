import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MonthView } from '../pages/Slots/MonthView.js';
import type { SlotItem } from '../types/slots.js';

// Pure presentational component — no QueryClientProvider/AuthProvider/Router needed.

function mkSlot(over: Partial<SlotItem>): SlotItem {
  return {
    id: 's0', driveId: 'd1', driveName: 'FE Cohort',
    employerId: 'e1', employerName: 'Acme Corp',
    date: '2026-07-15T00:00:00.000Z', start: '10:00', end: '12:00',
    capacity: 10, booked: 5, held: 0, status: 'Scheduled', link: '', attended: 0, noShow: 0,
    ...over,
  };
}

// Four sessions on 2026-07-15 (a Wednesday) — only the first 3 render as chips, the 4th folds
// into "+1 more". One Cancelled session on 2026-07-18 (a Saturday) for the `cancel` chip class.
const slots: SlotItem[] = [
  mkSlot({ id: 's1', start: '09:00', employerName: 'Acme Corp' }),
  mkSlot({ id: 's2', start: '10:00', employerName: 'Beta Labs' }),
  mkSlot({ id: 's3', start: '11:00', employerName: 'Gamma Inc' }),
  mkSlot({ id: 's4', start: '12:00', employerName: 'Delta LLC' }),
  mkSlot({ id: 's5', date: '2026-07-18T00:00:00.000Z', start: '14:00', employerName: 'Epsilon Co', status: 'Cancelled' }),
];

describe('MonthView', () => {
  it('shows up to 3 chips per day plus a "+N more" overflow', () => {
    render(
      <MonthView
        refDate={new Date(2026, 6, 15)}
        slots={slots}
        onChipClick={vi.fn()}
        onMoreClick={vi.fn()}
        onCellClick={vi.fn()}
      />,
    );
    expect(screen.getByText('9:00 AM · Acme')).toBeInTheDocument();
    expect(screen.getByText('10:00 AM · Beta')).toBeInTheDocument();
    expect(screen.getByText('11:00 AM · Gamma')).toBeInTheDocument();
    expect(screen.queryByText('12:00 PM · Delta')).not.toBeInTheDocument();
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });

  it('renders a Cancelled slot chip with the cancel class', () => {
    render(
      <MonthView
        refDate={new Date(2026, 6, 15)}
        slots={slots}
        onChipClick={vi.fn()}
        onMoreClick={vi.fn()}
        onCellClick={vi.fn()}
      />,
    );
    const chip = screen.getByText('2:00 PM · Epsilon');
    expect(chip).toHaveClass('cal-chip');
    expect(chip).toHaveClass('cancel');
  });

  it('fires onChipClick with the slot when a chip is clicked', async () => {
    const onChipClick = vi.fn();
    render(
      <MonthView
        refDate={new Date(2026, 6, 15)}
        slots={slots}
        onChipClick={onChipClick}
        onMoreClick={vi.fn()}
        onCellClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('9:00 AM · Acme'));
    expect(onChipClick).toHaveBeenCalledWith(slots[0]);
  });

  it('fires onMoreClick with the date key when "+N more" is clicked', async () => {
    const onMoreClick = vi.fn();
    render(
      <MonthView
        refDate={new Date(2026, 6, 15)}
        slots={slots}
        onChipClick={vi.fn()}
        onMoreClick={onMoreClick}
        onCellClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('+1 more'));
    expect(onMoreClick).toHaveBeenCalledWith('2026-07-15');
  });
});
