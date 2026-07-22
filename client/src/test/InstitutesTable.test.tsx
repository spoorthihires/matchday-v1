import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InstitutesTable, type InstituteColumnFilters } from '../pages/Institutes/InstitutesTable.js';
import type { InstituteListItem } from '../types/institutes.js';

const items: InstituteListItem[] = [
  { id: '1', name: 'CBIT', city: 'Hyderabad', type: 'Engineering College', status: 'Active', owner: 'Sharath P.', email: 'spoc@cbit.edu', uploaded: 96, signupPct: 80, completionPct: 75, matchReadyPct: 60, shortlistPct: 40, offerPct: 20, joinedPct: 10 },
];

const emptyFilters: InstituteColumnFilters = {
  type: [], status: [], uploaded: {}, signup: {}, completion: {}, matchReady: {}, shortlist: {}, offer: {}, joined: {},
};
const filterProps = { filters: emptyFilters, onFilterChange: vi.fn(), onFilterClear: vi.fn() };

describe('InstitutesTable', () => {
  it('renders an institute row with name, status and a funnel %', () => {
    render(<InstitutesTable items={items} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} onSort={vi.fn()} sort={undefined} order="asc" onRowAction={vi.fn()} {...filterProps} />);
    // Scoped to <tbody> since the Type/Status columns' filter <select>s also have "CBIT"/"Active"-free
    // but overlapping option text (Status's "Active" <option> collides with the row's status badge).
    const tbody = within(document.querySelector('tbody')!);
    expect(tbody.getByText('CBIT')).toBeInTheDocument();
    expect(tbody.getByText('Active')).toBeInTheDocument();
    expect(tbody.getByText('96')).toBeInTheDocument();
  });
});
