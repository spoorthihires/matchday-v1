import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JobseekersTable } from '../pages/Jobseekers/JobseekersTable.js';
import type { JobseekerListItem } from '../types/jobseekers.js';

const items: JobseekerListItem[] = [
  { id: '1', code: 'C-ABC123', name: 'Aarav Sharma', email: 'a@cbit.edu', instituteId: 'i1', instituteName: 'CBIT', stream: 'CSE', evaluationLabel: 'Completed', matchReadinessPct: 75, offerStatus: 'None', dupRisk: 'Low', consent: 'Granted', stage: 'MatchReady' },
];

const blockedItems: JobseekerListItem[] = [
  { ...items[0], id: '2', name: 'Aarav Patel', consent: 'Revoked' },
];

describe('JobseekersTable', () => {
  it('renders a candidate row with derived fields', () => {
    render(<JobseekersTable items={items} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} onSort={vi.fn()} sort={undefined} order="asc" onRowAction={vi.fn()} />);
    expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
    expect(screen.getByText('CBIT')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('opens the kebab menu with Edit, Change stream, Reset evaluation, and Block candidate for an active candidate', async () => {
    const onRowAction = vi.fn();
    render(<JobseekersTable items={items} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} onSort={vi.fn()} sort={undefined} order="asc" onRowAction={onRowAction} />);
    const user = userEvent.setup();
    await user.click(screen.getByTitle('More'));
    expect(screen.getByText('Change stream')).toBeInTheDocument();
    expect(screen.getByText('Reset evaluation')).toBeInTheDocument();
    expect(screen.getByText('Block candidate')).toBeInTheDocument();
    expect(screen.queryByText('Unblock candidate')).not.toBeInTheDocument();
    await user.click(screen.getByText('Block candidate'));
    expect(onRowAction).toHaveBeenCalledWith('block', '1');
  });

  it('shows Unblock candidate instead of Block candidate for a blocked candidate', async () => {
    const onRowAction = vi.fn();
    render(<JobseekersTable items={blockedItems} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} onSort={vi.fn()} sort={undefined} order="asc" onRowAction={onRowAction} />);
    const user = userEvent.setup();
    await user.click(screen.getByTitle('More'));
    expect(screen.getByText('Unblock candidate')).toBeInTheDocument();
    expect(screen.queryByText('Block candidate')).not.toBeInTheDocument();
    await user.click(screen.getByText('Unblock candidate'));
    expect(onRowAction).toHaveBeenCalledWith('unblock', '2');
  });
});
