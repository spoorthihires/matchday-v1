import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JobseekersTable } from '../pages/Jobseekers/JobseekersTable.js';
import type { JobseekerListItem } from '../types/jobseekers.js';

const items: JobseekerListItem[] = [
  { id: '1', code: 'C-ABC123', name: 'Aarav Sharma', email: 'a@cbit.edu', instituteId: 'i1', instituteName: 'CBIT', stream: 'CSE', evaluationLabel: 'Completed', matchReadinessPct: 75, offerStatus: 'None', dupRisk: 'Low', consent: 'Granted', stage: 'MatchReady' },
];

describe('JobseekersTable', () => {
  it('renders a candidate row with derived fields', () => {
    render(<JobseekersTable items={items} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} onSort={vi.fn()} sort={undefined} order="asc" onRowAction={vi.fn()} />);
    expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
    expect(screen.getByText('CBIT')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });
});
