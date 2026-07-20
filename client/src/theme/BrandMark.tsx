export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path
        d="M64 14 L26 14 A8 8 0 0 0 18 22 L18 78 A8 8 0 0 0 26 86 L74 86 A8 8 0 0 0 82 78 L82 46"
        fill="none"
        stroke="#1e3a8a"
        strokeWidth="11"
        strokeLinecap="butt"
        strokeLinejoin="round"
      />
      <path
        d="M30 49 L50 73 L94 6"
        fill="none"
        stroke="#f57316"
        strokeWidth="13"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
