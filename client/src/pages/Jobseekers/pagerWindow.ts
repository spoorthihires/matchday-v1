// Windows the page-number strip so it stays a handful of buttons wide regardless of how many
// pages exist (1,284 seeded rows / limit 10 ≈ 129 pages — one <button> per page was unusable).
// Always surfaces page 1 and the last page, the current page's immediate neighbors, and an
// ellipsis ('…', rendered as a disabled/plain span by the caller, never a button) over any gap.
export function pagerWindow(current: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set<number>([1, pages, current - 1, current, current + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  for (let i = 0; i < nums.length; i++) {
    if (i > 0 && nums[i] - nums[i - 1] > 1) out.push('…');
    out.push(nums[i]);
  }
  return out;
}
