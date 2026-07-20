import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrivesTable, type DriveColumnFilters } from '../pages/Drives/DrivesTable.js';
import type { DriveListItem } from '../types/drives.js';

const items: DriveListItem[] = [
  { id: '1', name: 'Alpha Frontend', domain: 'Frontend', stream: 'B.Tech', month: 'Jul 2026', frequency: 'One-time', eventDay: 'Wednesday', candCap: 500, empCap: 9, slotCap: 360, status: 'Published', createdBy: 'Platform Admin', primaryEventDate: '2026-07-15T04:30:00.000Z' },
];

const emptyFilters: DriveColumnFilters = {
  domain: [], stream: [], status: [], month: {}, candCap: {}, empCap: {}, slotCap: {},
};
const filterProps = { filters: emptyFilters, onFilterChange: vi.fn(), onFilterClear: vi.fn() };

describe('DrivesTable', () => {
  it('renders a drive row with name and status', () => {
    render(<DrivesTable items={items} selectedIds={[]} onToggle={vi.fn()} onToggleAll={vi.fn()} onSort={vi.fn()} sort={undefined} order="desc" onRowAction={vi.fn()} {...filterProps} />);
    // Scoped to <tbody> since the Status column's filter <select> also has a "Published" <option>.
    const tbody = within(document.querySelector('tbody')!);
    expect(tbody.getByText('Alpha Frontend')).toBeInTheDocument();
    expect(tbody.getByText('Published')).toBeInTheDocument();
    expect(tbody.getByText('Jul 2026')).toBeInTheDocument();
  });
});
