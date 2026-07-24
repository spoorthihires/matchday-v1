import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JobseekersTable, type JobseekerColumnFilters } from '../pages/Jobseekers/JobseekersTable.js';
import type { JobseekerListItem } from '../types/jobseekers.js';

const items: JobseekerListItem[] = [
  { id: '1', code: 'C-ABC123', name: 'Aarav Sharma', email: 'a@cbit.edu', instituteId: 'i1', instituteName: 'CBIT', stream: 'CSE', evaluationLabel: 'Completed', matchReadinessPct: 75, offerStatus: 'None', dupRisk: 'Low', consent: 'Granted', stage: 'MatchReady' },
];

const emptyFilters: JobseekerColumnFilters = {
  instituteId: [], stream: [], evaluationStatus: [], offer: [], dupRisk: [], consent: [],
};
const filterProps = {
  instituteOptions: [{ id: 'i1', name: 'CBIT' }],
  filters: emptyFilters,
  onFilterChange: vi.fn(),
  onFilterClear: vi.fn(),
};

const blockedItems: JobseekerListItem[] = [
  { ...items[0], id: '2', name: 'Aarav Patel', consent: 'Revoked' },
];

describe('JobseekersTable', () => {
  it('renders a jobseeker row with derived fields', () => {
    render(<JobseekersTable items={items} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} onSort={vi.fn()} sort={undefined} order="asc" onRowAction={vi.fn()} {...filterProps} />);
    // Scoped to <tbody> since the Institute column's filter <select> also has a "CBIT" <option>.
    const tbody = within(document.querySelector('tbody')!);
    expect(tbody.getByText('Aarav Sharma')).toBeInTheDocument();
    expect(tbody.getByText('CBIT')).toBeInTheDocument();
    expect(tbody.getByText('75%')).toBeInTheDocument();
  });

  it('opens the kebab menu with Edit, Change stream, Reset evaluation, and Block jobseeker for an active jobseeker', async () => {
    const onRowAction = vi.fn();
    render(<JobseekersTable items={items} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} onSort={vi.fn()} sort={undefined} order="asc" onRowAction={onRowAction} {...filterProps} />);
    const user = userEvent.setup();
    await user.click(screen.getByTitle('More'));
    expect(screen.getByText('Change stream')).toBeInTheDocument();
    expect(screen.getByText('Reset evaluation')).toBeInTheDocument();
    expect(screen.getByText('Block jobseeker')).toBeInTheDocument();
    expect(screen.queryByText('Unblock jobseeker')).not.toBeInTheDocument();
    await user.click(screen.getByText('Block jobseeker'));
    expect(onRowAction).toHaveBeenCalledWith('block', '1');
  });

  it('shows Unblock jobseeker instead of Block jobseeker for a blocked jobseeker', async () => {
    const onRowAction = vi.fn();
    render(<JobseekersTable items={blockedItems} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} onSort={vi.fn()} sort={undefined} order="asc" onRowAction={onRowAction} {...filterProps} />);
    const user = userEvent.setup();
    await user.click(screen.getByTitle('More'));
    expect(screen.getByText('Unblock jobseeker')).toBeInTheDocument();
    expect(screen.queryByText('Block jobseeker')).not.toBeInTheDocument();
    await user.click(screen.getByText('Unblock jobseeker'));
    expect(onRowAction).toHaveBeenCalledWith('unblock', '2');
  });
});
