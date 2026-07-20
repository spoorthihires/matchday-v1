import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SortableHeader } from '../components/table/SortableHeader.js';

describe('SortableHeader', () => {
  it('renders just the label with no filter row when there is neither a sortKey nor a filter', () => {
    render(
      <table><thead><tr>
        <SortableHeader label="Stream" sort={undefined} order="asc" onSort={vi.fn()} />
      </tr></thead></table>,
    );
    expect(screen.getByText('Stream')).toHaveClass('col-label');
    const th = screen.getByText('Stream').closest('th')!;
    expect(th.querySelector('.col-filter-row')).toBeNull();
  });

  it('cycles through neutral -> asc -> desc via the dedicated sort button', async () => {
    const onSort = vi.fn();
    const { rerender } = render(
      <table><thead><tr>
        <SortableHeader label="Name" sortKey="name" sort={undefined} order="asc" onSort={onSort} />
      </tr></thead></table>,
    );
    const user = userEvent.setup();
    const sortBtn = screen.getByTitle('Sort by Name');
    expect(sortBtn.className).not.toContain('active');
    expect(sortBtn.querySelector('.sa')!.className).toContain('ti-arrows-sort');

    await user.click(sortBtn);
    expect(onSort).toHaveBeenCalledWith('name');

    rerender(
      <table><thead><tr>
        <SortableHeader label="Name" sortKey="name" sort="name" order="asc" onSort={onSort} />
      </tr></thead></table>,
    );
    expect(screen.getByTitle('Sort by Name').className).toContain('active');
    expect(screen.getByTitle('Sort by Name').querySelector('.sa')!.className).toContain('ti-sort-ascending');

    rerender(
      <table><thead><tr>
        <SortableHeader label="Name" sortKey="name" sort="name" order="desc" onSort={onSort} />
      </tr></thead></table>,
    );
    expect(screen.getByTitle('Sort by Name').querySelector('.sa')!.className).toContain('ti-sort-descending');
  });

  it('renders the optional inline filter control alongside the sort button', () => {
    render(
      <table><thead><tr>
        <SortableHeader
          label="Status" sortKey="status" sort={undefined} order="asc" onSort={vi.fn()}
          filter={<span data-testid="filter-slot">F</span>}
        />
      </tr></thead></table>,
    );
    expect(screen.getByTestId('filter-slot')).toBeInTheDocument();
    expect(screen.getByTitle('Sort by Status')).toBeInTheDocument();
  });

  it('renders a filter control with no sort button when sortKey is omitted', () => {
    render(
      <table><thead><tr>
        <SortableHeader
          label="Type" sort={undefined} order="asc" onSort={vi.fn()}
          filter={<span data-testid="filter-slot">F</span>}
        />
      </tr></thead></table>,
    );
    expect(screen.getByTestId('filter-slot')).toBeInTheDocument();
    expect(screen.queryByTitle('Sort by Type')).not.toBeInTheDocument();
  });
});
