export interface EnumOption {
  value: string;
  label: string;
}

export interface EnumFilterProps {
  options: EnumOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

// Always-visible, single-select native <select> in the column's filter row (matches the
// "Contest Status" reference — a plain "Select..." dropdown, not a checkbox popover). `value` stays
// an array (0 or 1 entries) so it round-trips through useColumnFilters'/toQueryParams' shared
// array-based filter-value shape without a separate single-value type.
export function EnumFilter({ options, value, onChange, placeholder = 'Select…' }: EnumFilterProps) {
  return (
    <select
      className="col-select"
      value={value[0] ?? ''}
      onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  );
}
