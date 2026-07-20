import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmployersTable, type EmployerColumnFilters } from '../pages/Employers/EmployersTable.js';
import type { EmployerListItem } from '../types/employers.js';

const items: EmployerListItem[] = [
  {
    id: '1', name: 'Quantbridge', industry: 'Fintech', size: '201–1000', spoc: 'A. Khanna', email: 'careers@quantbridge.com',
    status: 'Active', activeDrives: 3, candidatesViewed: 540, shortlistRate: 44, offerRate: 18, respHours: 9,
  },
];

const emptyFilters: EmployerColumnFilters = {
  industry: [], status: [], drives: {}, viewed: {}, shortlist: {}, offer: {}, respHours: {},
};
const filterProps = { filters: emptyFilters, onFilterChange: vi.fn(), onFilterClear: vi.fn() };

describe('EmployersTable', () => {
  it('renders an employer row with status, stats, and formatted response time', () => {
    render(<EmployersTable items={items} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} onSort={vi.fn()} sort={undefined} order="asc" onRowAction={vi.fn()} {...filterProps} />);
    // Scoped to <tbody> since the Status column's filter <select> also has an "Active" <option>.
    const tbody = within(document.querySelector('tbody')!);
    expect(tbody.getByText('Quantbridge')).toBeInTheDocument();
    expect(tbody.getByText('Active')).toBeInTheDocument();
    expect(tbody.getByText('44%')).toBeInTheDocument();
    expect(tbody.getByText('9h')).toBeInTheDocument();
  });

  it('fires view-drives from the kebab', async () => {
    const onRowAction = vi.fn();
    render(<EmployersTable items={items} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} onSort={vi.fn()} sort={undefined} order="asc" onRowAction={onRowAction} {...filterProps} />);
    const user = userEvent.setup();
    await user.click(screen.getByTitle('More'));
    await user.click(screen.getByText(/View drives/i));
    expect(onRowAction).toHaveBeenCalledWith('view-drives', '1');
  });
});
