import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmployersTable } from '../pages/Employers/EmployersTable.js';
import type { EmployerListItem } from '../types/employers.js';

const items: EmployerListItem[] = [
  {
    id: '1', name: 'Quantbridge', industry: 'Fintech', size: '201–1000', spoc: 'A. Khanna', email: 'careers@quantbridge.com',
    status: 'Active', activeDrives: 3, candidatesViewed: 540, shortlistRate: 44, offerRate: 18, respHours: 9,
  },
];

describe('EmployersTable', () => {
  it('renders an employer row with status, stats, and formatted response time', () => {
    render(<EmployersTable items={items} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} onSort={vi.fn()} sort={undefined} order="asc" onRowAction={vi.fn()} />);
    expect(screen.getByText('Quantbridge')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('44%')).toBeInTheDocument();
    expect(screen.getByText('9h')).toBeInTheDocument();
  });
});
