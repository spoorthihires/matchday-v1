import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTableSort } from '../hooks/useTableSort.js';

describe('useTableSort', () => {
  it('starts unsorted (or at the given initial key) with ascending order', () => {
    const { result } = renderHook(() => useTableSort<'name' | 'matchReady'>());
    expect(result.current.sort).toBeUndefined();
    expect(result.current.order).toBe('asc');
  });

  it('clicking a new key selects it ascending; clicking the active key toggles order', () => {
    const { result } = renderHook(() => useTableSort<'name' | 'matchReady'>());

    act(() => result.current.onSort('name'));
    expect(result.current.sort).toBe('name');
    expect(result.current.order).toBe('asc');

    act(() => result.current.onSort('name'));
    expect(result.current.sort).toBe('name');
    expect(result.current.order).toBe('desc');

    act(() => result.current.onSort('name'));
    expect(result.current.order).toBe('asc');

    act(() => result.current.onSort('matchReady'));
    expect(result.current.sort).toBe('matchReady');
    expect(result.current.order).toBe('asc');
  });

  it('calls the onChange callback on every sort change', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useTableSort<'name'>(undefined, onChange));
    act(() => result.current.onSort('name'));
    act(() => result.current.onSort('name'));
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
