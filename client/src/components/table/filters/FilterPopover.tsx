import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useOnClickOutside } from '../../../hooks/useOnClickOutside.js';

export interface FilterPopoverProps {
  // Text shown on the always-visible trigger box itself (e.g. "Select range…" when empty, or a
  // summary of the current bounds like "100–600" / "Jan 2026 – Dec 2026" once set).
  summary: string;
  active: boolean;
  // Render-prop so the popover body (RangeFilter) can close the popover itself once its own
  // "Apply"/"Clear" commits — the body only ever writes to draft/local state until then, so no
  // parent refetch (and therefore no header-column reflow) happens while the popover is open.
  children: (close: () => void) => ReactNode;
}

// The compact "Select range…"-style trigger + popover used for number/date range columns (the one
// filter type that still needs more room than fits inline in the header's filter row).
//
// The panel is rendered through a portal into document.body, positioned with `position: fixed`
// anchored via the trigger's own getBoundingClientRect(). This isn't just a positioning nicety —
// table.dm's scroll/card wrappers (.dm-scroll/.dm-table-wrap) apply `overflow` for their
// horizontal-scroll and rounded-corner-card behavior, and CSS `overflow` clips *any* descendant
// (including `position: fixed` ones — fixed only changes what the element's `top`/`left` are
// relative to, not whether an ancestor's overflow clips it) that stays in that DOM subtree. A
// popover left in place would render at the right coordinates but still get its clickable area
// silently cut off by that ancestor once it's tall/wide enough. The portal moves the DOM node
// outside the clipped subtree entirely, so only actual viewport bounds ever constrain it.
export function FilterPopover({ summary, active, children }: FilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useOnClickOutside([wrapRef, panelRef], () => setOpen(false), open);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) { setPos(null); return; }
    const rect = triggerRef.current.getBoundingClientRect();
    // Clamp on-screen: a popover computed as partially below/right of the viewport (e.g. a
    // trigger near the table's bottom or right edge) would otherwise render off-screen and be
    // unreachable/unclickable rather than just visually shifted.
    const top = Math.min(rect.bottom + 4, window.innerHeight - 220);
    const left = Math.min(rect.left, window.innerWidth - 230);
    setPos({ top: Math.max(top, 8), left: Math.max(left, 8) });
  }, [open]);

  return (
    <span ref={wrapRef} className="col-range-wrap">
      <button
        ref={triggerRef}
        type="button"
        className={`col-range-trigger${active ? ' active' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="crt-text">{summary}</span>
        <i className="ti ti-chevron-down" />
      </button>
      {open && pos && createPortal(
        <div ref={panelRef} className="col-filter-pop" style={{ position: 'fixed', top: pos.top, left: pos.left }}>
          {children(() => setOpen(false))}
        </div>,
        document.body,
      )}
    </span>
  );
}
