import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DayView } from '../pages/Slots/DayView.js';
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

describe('DayView', () => {
  it('shows the empty state when there are no slots on the day', () => {
    render(<DayView slots={[]} onAction={vi.fn()} />);
    expect(screen.getByText(/No slots on this day/)).toBeInTheDocument();
  });

  it('renders a scheduled slot with time, employer, drive, capacity — but no Join button (no link)', () => {
    render(<DayView slots={[mkSlot({})]} onAction={vi.fn()} />);
    expect(screen.getByText('10:00 AM')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('FE Cohort')).toBeInTheDocument();
    expect(screen.getByText('5/10')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Join/ })).not.toBeInTheDocument();
    // Scheduled, not Completed — no attended/no-show detail.
    expect(screen.queryByText(/Attended/)).not.toBeInTheDocument();
  });

  it('shows the Join button when a link is present and status is not Cancelled', () => {
    render(<DayView slots={[mkSlot({ link: 'https://meet.example.com/x' })]} onAction={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Join/ })).toBeInTheDocument();
  });

  it('hides Join for a Cancelled slot even with a link, and shows Attended/No-shows for Completed', () => {
    render(
      <DayView
        slots={[mkSlot({ status: 'Cancelled', link: 'https://meet.example.com/x' })]}
        onAction={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Join/ })).not.toBeInTheDocument();
  });

  it('fires onAction with the slot for the last four quick-action buttons', async () => {
    const onAction = vi.fn();
    const slot = mkSlot({});
    render(<DayView slots={[slot]} onAction={onAction} />);
    await userEvent.click(screen.getByRole('button', { name: /Link/ }));
    expect(onAction).toHaveBeenCalledWith('link', slot);
    await userEvent.click(screen.getByRole('button', { name: /Reschedule/ }));
    expect(onAction).toHaveBeenCalledWith('resch', slot);
    await userEvent.click(screen.getByRole('button', { name: /No-shows/ }));
    expect(onAction).toHaveBeenCalledWith('noshow', slot);
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }));
    expect(onAction).toHaveBeenCalledWith('edit', slot);
  });
});
