import type { EvaluationStage } from '../../../types/drives.js';
import type { WizardStepProps } from './types.js';

// Ported from matchday-admin-app_23.html lines 2150-2181 (STEP 4: Evaluation). Titles,
// descriptions, icons and config-field labels are decorative/static (they mirror the fixed
// four evaluation stages the model always carries — see blankDriveModel() in DriveWizard.tsx),
// everything else (enabled/config values) is bound to `model.evaluation`.

interface EvalMeta {
  key: EvaluationStage['key'];
  title: string;
  desc: string;
  icon: string;
  colorClass: string;
  fields: { key: string; label: string }[];
}

const META: EvalMeta[] = [
  {
    key: 'mcq',
    title: 'MCQ round',
    desc: 'Aptitude & fundamentals multiple-choice test.',
    icon: 'ti-list-check',
    colorClass: 'i-indigo',
    fields: [
      { key: 'questions', label: 'Questions' },
      { key: 'durationMin', label: 'Duration (min)' },
    ],
  },
  {
    key: 'coding',
    title: 'Coding round',
    desc: 'Hands-on programming problems, auto-evaluated.',
    icon: 'ti-code',
    colorClass: 'i-teal',
    fields: [
      { key: 'problems', label: 'Problems' },
      { key: 'durationMin', label: 'Duration (min)' },
    ],
  },
  {
    key: 'tara',
    title: 'TARA AI interview',
    desc: 'AI-led prescreening interview with Copilot scoring.',
    icon: 'ti-robot',
    colorClass: 'i-violet',
    fields: [{ key: 'durationMin', label: 'Duration (min)' }],
  },
  {
    key: 'assignments',
    title: 'Assignments',
    desc: 'Take-home task submitted before the event.',
    icon: 'ti-file-text',
    colorClass: 'i-amber',
    fields: [{ key: 'deadlineDays', label: 'Deadline (days)' }],
  },
];

export function StepEvaluation({ model, onChange, errors }: WizardStepProps) {
  const anyEnabled = model.evaluation.some((e) => e.enabled);
  const showErr = errors.length > 0 && !anyEnabled;

  function toggleEnabled(key: EvaluationStage['key']) {
    onChange({
      evaluation: model.evaluation.map((e) => (e.key === key ? { ...e, enabled: !e.enabled } : e)),
    });
  }

  function setConfig(key: EvaluationStage['key'], field: string, value: number) {
    onChange({
      evaluation: model.evaluation.map((e) =>
        e.key === key ? { ...e, config: { ...e.config, [field]: value } } : e,
      ),
    });
  }

  return (
    <section className="wstep active" data-panel="3">
      <div className="wh">
        <div className="eyebrow">Step 4</div>
        <h2>Evaluation</h2>
        <p>Choose the screening stages candidates pass through before MatchDay.</p>
      </div>
      <div id="w-eval">
        {META.map((meta) => {
          const stage = model.evaluation.find((e) => e.key === meta.key);
          const enabled = stage?.enabled ?? false;
          return (
            <div key={meta.key} className={`evrow${enabled ? ' on' : ''}`} data-eval={meta.key}>
              <span className={`evi ${meta.colorClass}`}>
                <i className={`ti ${meta.icon}`} />
              </span>
              <div className="evbody">
                <b>{meta.title}</b>
                <p>{meta.desc}</p>
                <div className="evcfg">
                  {meta.fields.map((f) => (
                    <div key={f.key} className="mini-fld">
                      <label>{f.label}</label>
                      <input
                        type="number"
                        min={1}
                        value={stage?.config[f.key] ?? 0}
                        onChange={(e) => setConfig(meta.key, f.key, Number(e.target.value) || 0)}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className={`switch${enabled ? ' on' : ''}`} data-switch onClick={() => toggleEnabled(meta.key)} />
            </div>
          );
        })}
      </div>
      <div className="wfld full" style={{ marginTop: 6 }}>
        <div className="emsg" id="evalErr" style={{ display: showErr ? 'flex' : 'none' }}>
          <i className="ti ti-alert-circle" /> Enable at least one evaluation stage.
        </div>
      </div>
    </section>
  );
}
