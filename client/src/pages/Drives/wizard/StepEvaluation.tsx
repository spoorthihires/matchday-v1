import { useState } from 'react';
import type { EvaluationStage } from '../../../types/drives.js';
import type { EvalType } from '../../../types/evaluations.js';
import { useEvalConfigs } from '../../Evaluations/hooks/useEvalConfigs.js';
import { useTemplates } from '../../Templates/hooks/useTemplates.js';
import { EvalConfigModal } from '../../Evaluations/EvalConfigModal.js';
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
  cfgLabel: string;
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
    cfgLabel: 'MCQ configuration',
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
    cfgLabel: 'Coding configuration',
  },
  {
    key: 'tara',
    title: 'TARA AI interview',
    desc: 'AI-led prescreening interview with Copilot scoring.',
    icon: 'ti-robot',
    colorClass: 'i-violet',
    fields: [{ key: 'durationMin', label: 'Duration (min)' }],
    cfgLabel: 'TARA configuration',
  },
  {
    key: 'assignments',
    title: 'Assignments',
    desc: 'Take-home task submitted before the event.',
    icon: 'ti-file-text',
    colorClass: 'i-amber',
    fields: [{ key: 'deadlineDays', label: 'Deadline (days)' }],
    cfgLabel: 'Assignments configuration',
  },
];

const KEY_TO_TYPE: Record<EvaluationStage['key'], EvalType> = {
  mcq: 'MCQ', coding: 'Coding', tara: 'TARA', assignments: 'Assignments',
};
const TYPE_TO_KEY: Record<string, EvaluationStage['key']> = {
  MCQ: 'mcq', Coding: 'coding', TARA: 'tara', Assignments: 'assignments',
};

export function StepEvaluation({ model, onChange, errors }: WizardStepProps) {
  const { data: tplData } = useTemplates({ status: 'Active' });
  const templates = tplData?.items ?? [];
  const { data: cfgData } = useEvalConfigs({ status: 'Active' });
  const evalConfigs = cfgData?.items ?? [];
  const anyEnabled = model.evaluation.some((e) => e.enabled);
  const showErr = errors.length > 0 && !anyEnabled;
  const [addConfigFor, setAddConfigFor] = useState<EvaluationStage['key'] | null>(null);

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

  function setStageEvalConfig(key: EvaluationStage['key'], evalConfigId: string) {
    onChange({
      evaluation: model.evaluation.map((e) => (e.key === key ? { ...e, evalConfigId } : e)),
    });
  }

  return (
    <section className="wstep active" data-panel="3">
      <div className="wh">
        <div className="eyebrow">Step 4</div>
        <h2>Evaluation</h2>
        <p>Choose the screening stages jobseekers pass through before MatchDay.</p>
      </div>
      <div className="wfld full" style={{ marginBottom: 12 }}>
        <label htmlFor="tplPick">Start from a template</label>
        <select
          id="tplPick"
          className="select"
          style={{ appearance: 'auto' }}
          value={model.templateId ?? ''}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) { onChange({ templateId: '' }); return; }
            const t = templates.find((x) => x.id === id);
            if (!t) { onChange({ templateId: id }); return; }
            const a = t.sections.assessment;
            onChange({
              templateId: id,
              evaluation: model.evaluation.map((s) => ({ ...s, enabled: !!a[s.key as keyof typeof a] })),
            });
          }}
        >
          <option value="">No template</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <span className="fnote" style={{ fontSize: 11.5, color: 'var(--faint)' }}>Applying a template pre-fills the evaluation stages below.</span>
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
                  <div className="mini-fld">
                    <label htmlFor={`evcfg-${meta.key}`}>{meta.cfgLabel}</label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select
                        id={`evcfg-${meta.key}`}
                        className="select"
                        style={{ appearance: 'auto', flex: 1 }}
                        value={stage?.evalConfigId ?? ''}
                        onChange={(e) => setStageEvalConfig(meta.key, e.target.value)}
                      >
                        <option value="">No configuration</option>
                        {evalConfigs.filter((c) => c.type === KEY_TO_TYPE[meta.key]).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '7px 9px' }}
                        aria-label={`Add ${KEY_TO_TYPE[meta.key]} assessment configuration`}
                        title="Add Configuration"
                        onClick={() => setAddConfigFor(meta.key)}
                      >
                        <i className="ti ti-plus" />
                      </button>
                    </div>
                  </div>
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
      {addConfigFor && (
        <EvalConfigModal
          mode="create"
          initialType={KEY_TO_TYPE[addConfigFor]}
          onSaved={(created) => setStageEvalConfig(TYPE_TO_KEY[created.type] ?? addConfigFor, created._id)}
          onClose={() => setAddConfigFor(null)}
        />
      )}
    </section>
  );
}
