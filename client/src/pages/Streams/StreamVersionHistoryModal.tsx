import { useStreamMutations } from './hooks/useStreamMutations.js';
import type { StreamItem } from '../../types/streams.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (iso: string) => { const d = new Date(iso); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };

export interface StreamVersionHistoryModalProps { stream: StreamItem; onClose: () => void }

export function StreamVersionHistoryModal({ stream, onClose }: StreamVersionHistoryModalProps) {
  const { restore } = useStreamMutations();
  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="verTitle" style={{ maxWidth: 480 }}>
        <div className="modal-h"><div><h3 id="verTitle">Version history</h3><p>{stream.name} · currently v{stream.version}</p></div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button></div>
        <div className="modal-b" style={{ gridTemplateColumns: '1fr', paddingBottom: 16 }}>
          <div>
            {stream.versions.map((v) => {
              const cur = v.v === stream.version;
              return (
                <div className={`ver-item${cur ? ' cur' : ''}`} key={`${v.v}-${v.date}`}>
                  <span className="vtag">v{v.v}</span>
                  <div className="vb"><b>{v.note}</b><span><time>{fmtDate(v.date)}</time> · {v.by}</span></div>
                  {cur ? <span className="vrestore">Current</span> : <button className="vrestore" type="button" onClick={() => restore.mutate({ id: stream.id, v: v.v }, { onSuccess: onClose })}>Restore</button>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
