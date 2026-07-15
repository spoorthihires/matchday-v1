import type { DriveInput } from '../../../types/drives.js';
import type { WizardStepProps } from './types.js';

// Ported from matchday-admin-app_23.html lines 2073-2086 (STEP 1: Basic Info).

const CAND_TYPES: { v: DriveInput['candType']; icon: string; label: string }[] = [
  { v: 'Freshers', icon: 'ti-seeding', label: 'Freshers' },
  { v: 'Experienced', icon: 'ti-briefcase', label: 'Experienced' },
  { v: 'Both', icon: 'ti-users', label: 'Both' },
];

const MODES: { v: DriveInput['mode']; icon: string; label: string }[] = [
  { v: 'Online', icon: 'ti-world', label: 'Online' },
  { v: 'Onsite', icon: 'ti-building', label: 'Onsite' },
  { v: 'Hybrid', icon: 'ti-arrows-shuffle', label: 'Hybrid' },
];

export function StepBasics({ model, onChange, errors }: WizardStepProps) {
  const nameErr = errors.length > 0 && !model.name.trim();

  return (
    <section className="wstep active" data-panel="0">
      <div className="wh">
        <div className="eyebrow">Step 1</div>
        <h2>Basic Info</h2>
        <p>Give the drive a clear name and define the role it hires for.</p>
      </div>
      <div className={`wfld full${nameErr ? ' err' : ''}`} id="w-name">
        <label>
          Drive name <span className="req">*</span>
        </label>
        <input
          type="text"
          id="wName"
          placeholder="e.g. Frontend Engineers · July cohort"
          value={model.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <div className="emsg">
          <i className="ti ti-alert-circle" /> A drive name is required.
        </div>
      </div>
      <div className="wgrid">
        <div className="wfld">
          <label>Domain</label>
          <select id="wDomain" value={model.domain} onChange={(e) => onChange({ domain: e.target.value })}>
            <option>Frontend</option>
            <option>Backend</option>
            <option>Full-stack</option>
            <option>Data / ML</option>
            <option>DevOps</option>
          </select>
        </div>
        <div className="wfld">
          <label>Stream</label>
          <select id="wStream" value={model.stream} onChange={(e) => onChange({ stream: e.target.value })}>
            <option>B.Tech</option>
            <option>M.Tech</option>
            <option>MCA</option>
            <option>MBA</option>
          </select>
        </div>
      </div>
      <div className="wfld full">
        <label>Candidate type</label>
        <div className="pick" data-single="candType">
          {CAND_TYPES.map(({ v, icon, label }) => (
            <span
              key={v}
              className={`opt${model.candType === v ? ' on' : ''}`}
              data-v={v}
              onClick={() => onChange({ candType: v })}
            >
              <i className={`ti ${icon}`} /> {label}
            </span>
          ))}
        </div>
      </div>
      <div className="wfld full">
        <label>Mode</label>
        <div className="pick" data-single="mode">
          {MODES.map(({ v, icon, label }) => (
            <span
              key={v}
              className={`opt${model.mode === v ? ' on' : ''}`}
              data-v={v}
              onClick={() => onChange({ mode: v })}
            >
              <i className={`ti ${icon}`} /> {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
