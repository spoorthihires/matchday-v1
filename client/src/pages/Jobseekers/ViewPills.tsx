// Ported from matchday-admin-app_23.html lines 1635-1644 (`.viewpills` / `#jsViews`). The prototype
// has 8 buttons; this renders the 7 in-scope lenses per the task brief and OMITS "By Duplicate
// Risk" (data-view="dup") — deferred, not part of this task.

export type JobseekerView = 'all' | 'institute' | 'stream' | 'eval' | 'match' | 'offer' | 'consent';

const VIEWS: { key: JobseekerView; label: string; icon: string }[] = [
  { key: 'all', label: 'All Jobseekers', icon: 'ti-users' },
  { key: 'institute', label: 'By Institute', icon: 'ti-building-community' },
  { key: 'stream', label: 'By Stream', icon: 'ti-git-branch' },
  { key: 'eval', label: 'By Evaluation', icon: 'ti-clipboard-check' },
  { key: 'match', label: 'By Match Readiness', icon: 'ti-user-check' },
  { key: 'offer', label: 'By Offer Status', icon: 'ti-send' },
  { key: 'consent', label: 'By Consent', icon: 'ti-shield-check' },
];

export interface ViewPillsProps {
  view: JobseekerView;
  onChange: (view: JobseekerView) => void;
}

export function ViewPills({ view, onChange }: ViewPillsProps) {
  return (
    <div className="viewpills">
      {VIEWS.map((v) => (
        <button key={v.key} className={view === v.key ? 'on' : undefined} onClick={() => onChange(v.key)}>
          <i className={`ti ${v.icon}`} /> {v.label}
        </button>
      ))}
    </div>
  );
}
