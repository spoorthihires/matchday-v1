import { useTemplateMutations } from './hooks/useTemplateMutations.js';
import { fmtDate } from './templateUtils.js';
import type { TemplateItem } from '../../types/templates.js';

export interface VersionHistoryModalProps {
  template: TemplateItem;
  onClose: () => void;
}

export function VersionHistoryModal({ template, onClose }: VersionHistoryModalProps) {
  const { restore } = useTemplateMutations();
  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="verTitle" style={{ maxWidth: 480 }}>
        <div className="modal-h">
          <div>
            <h3 id="verTitle">Version history</h3>
            <p>{template.name} · currently v{template.version}</p>
          </div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-b" style={{ gridTemplateColumns: '1fr', paddingBottom: 16 }}>
          <div>
            {template.versions.map((v) => {
              const isCurrent = v.v === template.version;
              return (
                <div className={`ver-item${isCurrent ? ' cur' : ''}`} key={`${v.v}-${v.date}`}>
                  <span className="vtag">v{v.v}</span>
                  <div className="vb"><b>{v.note}</b><span><time dateTime={v.date}>{fmtDate(v.date)}</time> · {v.by}</span></div>
                  {isCurrent
                    ? <span className="vrestore">Current</span>
                    : (
                      <button
                        className="vrestore" type="button"
                        onClick={() => restore.mutate({ id: template.id, v: v.v }, { onSuccess: onClose })}
                      >
                        Restore
                      </button>
                    )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
