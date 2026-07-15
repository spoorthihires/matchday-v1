import type { WizardStepProps } from './types.js';

// Ported from matchday-admin-app_23.html lines 2185-2190 (STEP 5: Visibility). This step has no
// validation rule (validateStep returns [] for step 4), so `errors` is accepted for interface
// consistency but never populated.

const EMPLOYER_REG: { v: string; icon: string }[] = [
  { v: 'Open', icon: 'ti-lock-open' },
  { v: 'Invite-only', icon: 'ti-mail' },
  { v: 'Closed', icon: 'ti-lock' },
];
const INSTITUTE_VIS: { v: string; icon: string }[] = [
  { v: 'All institutes', icon: 'ti-building-community' },
  { v: 'Selected institutes', icon: 'ti-list-check' },
  { v: 'Private link', icon: 'ti-link' },
];
const CANDIDATE_ACCESS: { v: string; icon: string }[] = [
  { v: 'Public', icon: 'ti-world' },
  { v: 'Eligible only', icon: 'ti-user-check' },
  { v: 'Invite', icon: 'ti-mail' },
];

export function StepVisibility({ model, onChange }: WizardStepProps) {
  const { visibility } = model;

  return (
    <section className="wstep active" data-panel="4">
      <div className="wh">
        <div className="eyebrow">Step 5</div>
        <h2>Visibility</h2>
        <p>Control who can register, see and access this drive.</p>
      </div>
      <div className="wfld full">
        <label>Employer registration</label>
        <div className="pick" data-single="empReg">
          {EMPLOYER_REG.map(({ v, icon }) => (
            <span
              key={v}
              className={`opt${visibility.employerReg === v ? ' on' : ''}`}
              data-v={v}
              onClick={() => onChange({ visibility: { ...visibility, employerReg: v } })}
            >
              <i className={`ti ${icon}`} /> {v}
            </span>
          ))}
        </div>
      </div>
      <div className="wfld full">
        <label>Institute visibility</label>
        <div className="pick" data-single="instVis">
          {INSTITUTE_VIS.map(({ v, icon }) => (
            <span
              key={v}
              className={`opt${visibility.instituteVis === v ? ' on' : ''}`}
              data-v={v}
              onClick={() => onChange({ visibility: { ...visibility, instituteVis: v } })}
            >
              <i className={`ti ${icon}`} /> {v}
            </span>
          ))}
        </div>
      </div>
      <div className="wfld full">
        <label>Candidate access</label>
        <div className="pick" data-single="candAccess">
          {CANDIDATE_ACCESS.map(({ v, icon }) => (
            <span
              key={v}
              className={`opt${visibility.candidateAccess === v ? ' on' : ''}`}
              data-v={v}
              onClick={() => onChange({ visibility: { ...visibility, candidateAccess: v } })}
            >
              <i className={`ti ${icon}`} /> {v}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
