import { useState } from 'react';

export type ColumnFilterValue = string | string[] | { from?: string; to?: string };

export interface UseColumnFiltersResult<F extends Record<string, ColumnFilterValue>> {
  filters: F;
  setFilter: <K extends keyof F>(key: K, value: F[K]) => void;
  clearFilter: (key: keyof F) => void;
  clearAll: () => void;
  // Serializes into query params: arrays -> CSV, ranges -> `${key}From`/`${key}To`, empty dropped.
  // Spread the result into a page's existing URLSearchParams-building params object.
  toQueryParams: () => Record<string, string>;
}

function isEmpty(value: ColumnFilterValue | undefined): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.trim() === '';
  return !value.from && !value.to;
}

export function useColumnFilters<F extends Record<string, ColumnFilterValue>>(
  initial: F,
  onChange?: () => void,
): UseColumnFiltersResult<F> {
  const [filters, setFilters] = useState<F>(initial);

  function setFilter<K extends keyof F>(key: K, value: F[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    onChange?.();
  }

  function clearFilter(key: keyof F) {
    setFilters((prev) => {
      const current = prev[key];
      const empty = (Array.isArray(current) ? [] : typeof current === 'string' ? '' : {}) as F[typeof key];
      return { ...prev, [key]: empty };
    });
    onChange?.();
  }

  function clearAll() {
    setFilters(initial);
    onChange?.();
  }

  function toQueryParams(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const key of Object.keys(filters)) {
      const value = filters[key];
      if (isEmpty(value)) continue;
      if (Array.isArray(value)) {
        out[key] = value.join(',');
      } else if (typeof value === 'string') {
        out[key] = value;
      } else {
        if (value.from) out[`${key}From`] = value.from;
        if (value.to) out[`${key}To`] = value.to;
      }
    }
    return out;
  }

  return { filters, setFilter, clearFilter, clearAll, toQueryParams };
}
