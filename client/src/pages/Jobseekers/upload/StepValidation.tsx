import type { ImportPreviewResponse } from '../hooks/useImportPreview.js';

// Ported from matchday-admin-app_23.html lines 2241 (STEP 3: Validation) plus valResult() (lines
// ~4148-4152): `.res-banner` (warn/ok) + a `.dm` table of failing rows. The prototype's error rows
// come from a flat mock `errs` list (row/field/msg); the real `ImportRowResult.errors` is a
// string[] per row (jobseekers.import.ts's analyze() can push multiple messages for one row), so
// this renders one row per invalid candidate with its errors joined, rather than one row per error.

export interface StepValidationProps {
  preview: ImportPreviewResponse | undefined;
}

export function StepValidation({ preview }: StepValidationProps) {
  const invalids = preview?.rows.filter((r) => !r.valid) ?? [];

  return (
    <section className="wstep active" data-panel="2">
      <div className="wh">
        <div className="eyebrow">Step 3</div>
        <h2>Validation</h2>
        <p>Validating required fields, email format, CGPA range and graduation year.</p>
      </div>

      {invalids.length === 0 ? (
        <div className="res-banner res-ok">
          <i className="ti ti-circle-check" />
          <div><b>All rows valid.</b></div>
        </div>
      ) : (
        <>
          <div className="res-banner res-warn">
            <i className="ti ti-alert-triangle" />
            <div>
              <b>{invalids.length} row{invalids.length === 1 ? '' : 's'} failed validation.</b>{' '}
              Invalid rows are excluded; fix and re-upload them later.
            </div>
          </div>
          <div className="dm-scroll">
            <table className="dm">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Row</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {invalids.map((r) => (
                  <tr key={r.index}>
                    <td className="mono">{r.index + 1}</td>
                    <td>{r.data.name || '—'}</td>
                    <td>{r.data.email || '—'}</td>
                    <td style={{ color: 'var(--danger)' }}>{r.errors.join(', ')}</td>
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
