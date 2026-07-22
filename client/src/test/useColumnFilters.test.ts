import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useColumnFilters } from '../hooks/useColumnFilters.js';

describe('useColumnFilters', () => {
  it('serializes array values as CSV and drops empty ones', () => {
    const { result } = renderHook(() => useColumnFilters({ status: [] as string[], q: '' }));
    act(() => result.current.setFilter('status', ['Active', 'Pending']));
    expect(result.current.toQueryParams()).toEqual({ status: 'Active,Pending' });
  });

  it('serializes range values as `${key}From`/`${key}To`, omitting unset bounds', () => {
    const { result } = renderHook(() => useColumnFilters({ cutoff: {} as { from?: string; to?: string } }));
    act(() => result.current.setFilter('cutoff', { from: '10' }));
    expect(result.current.toQueryParams()).toEqual({ cutoffFrom: '10' });
    act(() => result.current.setFilter('cutoff', { from: '10', to: '90' }));
    expect(result.current.toQueryParams()).toEqual({ cutoffFrom: '10', cutoffTo: '90' });
  });

  it('treats a whitespace-only string filter as empty', () => {
    const { result } = renderHook(() => useColumnFilters({ q: '' }));
    act(() => result.current.setFilter('q', '   '));
    expect(result.current.toQueryParams()).toEqual({});
    act(() => result.current.setFilter('q', 'abc'));
    expect(result.current.toQueryParams()).toEqual({ q: 'abc' });
  });

  it('clearFilter resets a single key back to its empty shape', () => {
    const { result } = renderHook(() => useColumnFilters({ status: [] as string[], q: '' }));
    act(() => result.current.setFilter('status', ['Active']));
    act(() => result.current.setFilter('q', 'abc'));
    act(() => result.current.clearFilter('status'));
    expect(result.current.toQueryParams()).toEqual({ q: 'abc' });
  });

  it('clearAll resets every key back to the initial value', () => {
    const { result } = renderHook(() => useColumnFilters({ status: [] as string[], q: '' }));
    act(() => result.current.setFilter('status', ['Active']));
    act(() => result.current.setFilter('q', 'abc'));
    act(() => result.current.clearAll());
    expect(result.current.toQueryParams()).toEqual({});
  });

  it('calls the onChange callback whenever a filter is set or cleared', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useColumnFilters({ status: [] as string[] }, onChange));
    act(() => result.current.setFilter('status', ['Active']));
    act(() => result.current.clearFilter('status'));
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
