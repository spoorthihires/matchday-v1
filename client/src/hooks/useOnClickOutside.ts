import { useEffect } from 'react';
import type { RefObject } from 'react';

// Accepts one ref or several — a click is only "outside" when it lands outside ALL of them.
// Multiple refs matter when the triggered content is rendered via a portal (e.g. a popover body
// appended to document.body to escape an ancestor's `overflow: hidden` clipping): the trigger and
// the portaled panel are then disjoint DOM subtrees, so a single ref can't cover both.
export function useOnClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null> | RefObject<T | null>[],
  onOutside: () => void,
  active = true,
): void {
  useEffect(() => {
    if (!active) return;
    const refs = Array.isArray(ref) ? ref : [ref];
    function handle(e: MouseEvent) {
      const inside = refs.some((r) => r.current && r.current.contains(e.target as Node));
      if (!inside) onOutside();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [ref, onOutside, active]);
}
