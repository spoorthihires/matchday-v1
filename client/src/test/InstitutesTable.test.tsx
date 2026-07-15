import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InstitutesTable } from '../pages/Institutes/InstitutesTable.js';
import type { InstituteListItem } from '../types/institutes.js';

const items: InstituteListItem[] = [
  { id: '1', name: 'CBIT', city: 'Hyderabad', type: 'Engineering College', status: 'Active', owner: 'Sharath P.', email: 'spoc@cbit.edu', uploaded: 96, signupPct: 80, completionPct: 75, matchReadyPct: 60, shortlistPct: 40, offerPct: 20, joinedPct: 10 },
];

describe('InstitutesTable', () => {
  it('renders an institute row with name, status and a funnel %', () => {
    render(<InstitutesTable items={items} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} onSort={vi.fn()} sort={undefined} order="asc" onRowAction={vi.fn()} />);
    expect(screen.getByText('CBIT')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('96')).toBeInTheDocument();
  });
});
