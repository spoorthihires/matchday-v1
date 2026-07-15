import type { ImportPreviewResponse } from '../hooks/useImportPreview.js';

// Ported from matchday-admin-app_23.html lines 2240 (STEP 2: Duplicate Check) plus the
// dupResult()/bindDupActions() runtime helpers (lines ~4126-4148): `.res-banner` (warn/ok) +
// `.dm-scroll > table.dm` listing each flagged row with a per-row Remove action. The prototype's
// duptable also has Edit/View actions and a select-all checkbox column backed by mock phone
// numbers not present in the real `ImportRowResult` — this port keeps only Remove (the one action
// with real wizard-state semantics: dropping the row and re-previewing) against the plain `.dm`
// table chrome already used elsewhere in this app (JobseekersTable, InstitutesTable, TabAudit).

export interface StepDuplicatesProps {
  preview: ImportPreviewResponse | undefined;
  busy: boolean;
  onRemoveRow: (index: number) => void;
}

export function StepDuplicates({ preview, busy, onRemoveRow }: StepDuplicatesProps) {
  const dupes = preview?.rows.filter((r) => r.dupe) ?? [];

  return (
    <section className="wstep active" data-panel="1">
      <div className="wh">
        <div className="eyebrow">Step 2</div>
        <h2>Duplicate Check</h2>
        <p>Candidates in this file that match existing records or repeat within the batch. Remove any that aren&apos;t real duplicates — the rest are skipped on import.</p>
      </div>

      {dupes.length === 0 ? (
        <div className="res-banner res-ok">
          <i className="ti ti-circle-check" />
          <div><b>No duplicates found.</b></div>
        </div>
      ) : (
        <>
          <div className="res-banner res-warn">
            <i className="ti ti-alert-triangle" />
            <div>
              <b>{dupes.length} duplicate{dupes.length === 1 ? '' : 's'} detected.</b>{' '}
              Matches existing records or repeats within the file — these are skipped on import.
            </div>
          </div>
          <div className="dm-scroll">
            <table className="dm">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Row</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Reason</th>
                  <th className="r">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dupes.map((r) => (
                  <tr key={r.index}>
                    <td className="mono">{r.index + 1}</td>
                    <td>{r.data.name}</td>
                    <td>{r.data.email}</td>
                    <td>{r.dupeReason}</td>
                    <td className="r">
                      <button className="btn btn-ghost" disabled={busy} onClick={() => onRemoveRow(r.index)}>
                        <i className="ti ti-trash" /> Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
