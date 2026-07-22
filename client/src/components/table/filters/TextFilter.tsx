import { useEffect, useState } from 'react';

export interface TextFilterProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  numeric?: boolean;
}

// Always-visible input in the column's filter row. Debounces onChange (matches the toolbar search
// box's 300ms debounce, e.g. JobseekersToolbar.tsx) so typing doesn't refetch on every keystroke.
export function TextFilter({ value, onChange, placeholder, numeric }: TextFilterProps) {
  const [local, setLocal] = useState(value);

  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => { if (local !== value) onChange(local); }, 300);
    return () => clearTimeout(t);
    // Intentionally depends on `local` only — see the identical pattern/rationale in JobseekersToolbar.tsx.
  }, [local]);

  return (
    <input
      className="col-text-input"
      type={numeric ? 'number' : 'text'}
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
    />
  );
}
