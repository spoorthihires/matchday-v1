import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StreamTable, type StreamColumnFilters } from '../pages/Streams/StreamTable.js';
import type { StreamItem } from '../types/streams.js';

const item = (over: Partial<StreamItem> = {}): StreamItem => ({
  id: 's1', code: 'STR-ABC', name: 'Frontend Engineering', parent: 'Engineering', label: 'Frontend Developer',
  skills: ['React', 'TypeScript', 'CSS', 'HTML'], good: [], flow: ['MCQ', 'Coding', 'TARA'], cutoff: 65, cgpa: 6.5, backlogs: 1,
  grad: ['2025'], branches: ['CSE', 'IT'], sources: ['Institutes'], status: 'Active', version: '1.3', versions: [], drives: 0,
  createdAt: '2026-05-30T00:00:00.000Z', updatedAt: '2026-07-10T00:00:00.000Z', ...over,
});

const emptyFilters: StreamColumnFilters = { parent: [], status: [], cutoff: {} };
const filterProps = { filters: emptyFilters, onFilterChange: vi.fn(), onFilterClear: vi.fn() };

describe('StreamTable', () => {
  it('renders a row with code, skills (first 3 + overflow), version and status', () => {
    render(<StreamTable items={[item()]} sort="name" order="asc" onSort={() => {}} onAction={() => {}} {...filterProps} />);
    // Scoped to <tbody> since the Status column's filter <select> also has an "Active" <option>.
    const tbody = within(document.querySelector('tbody')!);
    expect(tbody.getByText('Frontend Engineering')).toBeInTheDocument();
    expect(tbody.getByText('STR-ABC')).toBeInTheDocument();
    expect(tbody.getByText('React')).toBeInTheDocument();
    expect(tbody.getByText('+1')).toBeInTheDocument();      // 4 skills → first 3 + "+1"
    expect(tbody.getByText('v1.3')).toBeInTheDocument();
    expect(tbody.getByText('Active')).toBeInTheDocument();
  });
  it('clicking the Cutoff sort button fires onSort with the column key', async () => {
    const onSort = vi.fn();
    render(<StreamTable items={[item()]} sort="name" order="asc" onSort={onSort} onAction={() => {}} {...filterProps} />);
    await userEvent.setup().click(screen.getByTitle('Sort by Cutoff'));
    expect(onSort).toHaveBeenCalledWith('cutoff');
  });
  it('kebab version action fires onAction', async () => {
    const onAction = vi.fn();
    render(<StreamTable items={[item()]} sort="name" order="asc" onSort={() => {}} onAction={onAction} {...filterProps} />);
    const user = userEvent.setup();
    await user.click(screen.getByTitle('More'));
    await user.click(screen.getByText(/Version history/i));
    expect(onAction).toHaveBeenCalledWith('version', expect.objectContaining({ id: 's1' }));
  });
  it('renders the derived Drives count column', () => {
    render(<StreamTable items={[item({ drives: 7 })]} sort="name" order="asc" onSort={() => {}} onAction={() => {}} {...filterProps} />);
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('Drives')).toBeTruthy();
  });
});
