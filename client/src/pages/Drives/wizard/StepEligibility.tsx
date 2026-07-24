import type { WizardStepProps } from './types.js';

// Ported from matchday-admin-app_23.html lines 2110-2145 (STEP 3: Eligibility).

const SOURCES = ['Institutes', 'Resume Vault', 'Referrals', 'Direct Apply', 'Recruiter Uploads'];
const BRANCHES = ['CSE', 'IT', 'ECE', 'EEE', 'MECH', 'MCA', 'MBA'];
const GRAD_YEARS = [2024, 2025, 2026, 2027];
const EXP_TYPES: { v: string; icon: string }[] = [
  { v: 'Freshers only', icon: 'ti-seeding' },
  { v: '0–2 yrs', icon: 'ti-clock' },
  { v: '2–5 yrs', icon: 'ti-clock' },
  { v: '5+ yrs', icon: 'ti-clock' },
];

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export function StepEligibility({ model, onChange, errors }: WizardStepProps) {
  const { eligibility } = model;
  const sourcesErr = errors.length > 0 && eligibility.sources.length === 0;
  const branchesErr = errors.length > 0 && eligibility.branches.length === 0;

  return (
    <section className="wstep active" data-panel="2">
      <div className="wh">
        <div className="eyebrow">Step 3</div>
        <h2>Eligibility</h2>
        <p>Define which jobseekers can enter this drive.</p>
      </div>
      <div className={`wfld full${sourcesErr ? ' err' : ''}`} id="w-sources">
        <label>
          Eligible sources <span className="req">*</span>
        </label>
        <div className="chips" data-multi="sources">
          {SOURCES.map((v) => (
            <span
              key={v}
              className={`chipc${eligibility.sources.includes(v) ? ' on' : ''}`}
              data-v={v}
              onClick={() => onChange({ eligibility: { ...eligibility, sources: toggle(eligibility.sources, v) } })}
            >
              <i className="ti ti-check" />
              {v}
            </span>
          ))}
        </div>
        <div className="emsg">
          <i className="ti ti-alert-circle" /> Pick at least one source.
        </div>
      </div>
      <div className={`wfld full${branchesErr ? ' err' : ''}`} id="w-branches">
        <label>
          Allowed branches <span className="req">*</span>
        </label>
        <div className="chips" data-multi="branches">
          {BRANCHES.map((v) => (
            <span
              key={v}
              className={`chipc${eligibility.branches.includes(v) ? ' on' : ''}`}
              data-v={v}
              onClick={() => onChange({ eligibility: { ...eligibility, branches: toggle(eligibility.branches, v) } })}
            >
              <i className="ti ti-check" />
              {v}
            </span>
          ))}
        </div>
        <div className="emsg">
          <i className="ti ti-alert-circle" /> Pick at least one branch.
        </div>
      </div>
      <div className="wfld full">
        <label>Graduation years</label>
        <div className="chips" data-multi="gradYears">
          {GRAD_YEARS.map((v) => (
            <span
              key={v}
              className={`chipc${eligibility.gradYears.includes(v) ? ' on' : ''}`}
              data-v={v}
              onClick={() => onChange({ eligibility: { ...eligibility, gradYears: toggle(eligibility.gradYears, v) } })}
            >
              <i className="ti ti-check" />
              {v}
            </span>
          ))}
        </div>
      </div>
      <div className="wfld full">
        <label>Experience criteria</label>
        <div className="pick" data-single="expType">
          {EXP_TYPES.map(({ v, icon }) => (
            <span
              key={v}
              className={`opt${eligibility.expType === v ? ' on' : ''}`}
              data-v={v}
              onClick={() => onChange({ eligibility: { ...eligibility, expType: v } })}
            >
              <i className={`ti ${icon}`} /> {v}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
