import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrivesTable } from '../pages/Drives/DrivesTable.js';
import type { DriveListItem } from '../types/drives.js';

const items: DriveListItem[] = [
  { id: '1', name: 'Alpha Frontend', domain: 'Frontend', stream: 'B.Tech', month: 'Jul 2026', frequency: 'One-time', eventDay: 'Wednesday', candCap: 500, empCap: 9, slotCap: 360, status: 'Published', createdBy: 'Platform Admin', primaryEventDate: '2026-07-15T04:30:00.000Z' },
];

describe('DrivesTable', () => {
  it('renders a drive row with name and status', () => {
    render(<DrivesTable items={items} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} onSort={vi.fn()} sort={undefined} order="desc" onRowAction={vi.fn()} />);
    expect(screen.getByText('Alpha Frontend')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('Jul 2026')).toBeInTheDocument();
  });
});
