import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RangeFilter } from '../components/table/filters/RangeFilter.js';

describe('RangeFilter', () => {
  it('number mode: edits stay in local draft state until Apply is clicked', async () => {
    const onChange = vi.fn();
    const close = vi.fn();
    render(<RangeFilter type="number" value={{}} onChange={onChange} onClear={vi.fn()} close={close} />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Min'), '5');
    expect(onChange).not.toHaveBeenCalled(); // draft-only, not committed yet
    await user.click(screen.getByText('Apply'));
    expect(onChange).toHaveBeenCalledWith({ from: '5' });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('Clear resets the draft, calls onClear, and closes', async () => {
    const onClear = vi.fn();
    const close = vi.fn();
    render(<RangeFilter type="number" value={{ from: '10', to: '20' }} onChange={vi.fn()} onClear={onClear} close={close} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Clear'));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('date mode renders two date inputs plus a month calendar grid', () => {
    render(<RangeFilter type="date" value={{}} onChange={vi.fn()} onClear={vi.fn()} close={vi.fn()} />);
    const dateInputs = document.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBe(2);
    expect(screen.getByText('Su')).toBeInTheDocument();
  });

  it('date mode: picking a day starts a draft `from`, committed only on Apply', async () => {
    const onChange = vi.fn();
    const today = new Date();
    render(<RangeFilter type="date" value={{}} onChange={onChange} onClear={vi.fn()} close={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('15'));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByText('Apply'));
    const expectedIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-15`;
    expect(onChange).toHaveBeenLastCalledWith({ from: expectedIso, to: undefined });
  });
});
