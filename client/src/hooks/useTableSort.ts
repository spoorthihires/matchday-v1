import { useState } from 'react';

export interface UseTableSortResult<K extends string> {
  sort: K | undefined;
  order: 'asc' | 'desc';
  onSort: (key: K) => void;
}

// Shared 3-state click-to-cycle sort state, replacing the sort/order useState pair + handleSort
// duplicated in every table page's index.tsx (new key -> asc; same key -> toggle asc/desc).
export function useTableSort<K extends string>(initial?: K, onChange?: () => void): UseTableSortResult<K> {
  const [sort, setSort] = useState<K | undefined>(initial);
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');

  function onSort(key: K) {
    if (sort === key) {
      setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setOrder('asc');
    }
    onChange?.();
  }

  return { sort, order, onSort };
}
