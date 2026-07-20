import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EnumFilter } from '../components/table/filters/EnumFilter.js';

const options = [
  { value: 'Active', label: 'Active' },
  { value: 'Disabled', label: 'Disabled' },
];

describe('EnumFilter', () => {
  it('renders a native single-select with a placeholder option', () => {
    render(<EnumFilter options={options} value={[]} onChange={vi.fn()} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(screen.getByRole('option', { name: 'Select…' })).toBeInTheDocument();
  });

  it('selecting a value calls onChange with a single-element array', async () => {
    const onChange = vi.fn();
    render(<EnumFilter options={options} value={[]} onChange={onChange} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox'), 'Active');
    expect(onChange).toHaveBeenCalledWith(['Active']);
  });

  it('selecting the placeholder option clears the filter', async () => {
    const onChange = vi.fn();
    render(<EnumFilter options={options} value={['Active']} onChange={onChange} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox'), '');
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('reflects the current single value as the select value', () => {
    render(<EnumFilter options={options} value={['Disabled']} onChange={vi.fn()} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('Disabled');
  });
});
