import type { ChangeEvent, DragEvent, KeyboardEvent, RefObject } from 'react';
import { CSV_TEMPLATE, type RawRow } from './template.js';

// Ported from matchday-admin-app_23.html lines 2232-2237 (STEP 1: CSV Upload — .dropzone,
// #upFileChip/.filechip, .up-note) plus the selectFile()/openUploadWizard() runtime helpers
// (lines ~4115-4128) that build the file chip and wire #upSample/#upTemplate. The prototype
// disables nothing while its setTimeout-based "scan" runs; this port instead gates every
// interactive control on `busy` (preview/commit in flight) per the wizard shell's established
// convention (Task 7) — file input, dropzone click-to-browse and drop, and the sample link. The
// CSV-template download is a pure client-side Blob with no server round trip, so it stays
// enabled even while busy, matching the prototype's own unguarded `#upTemplate` handler.

export interface StepUploadProps {
  rows: RawRow[];
  fileName: string | null;
  busy: boolean;
  fileInputRef: RefObject<HTMLInputElement>;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onFileDrop: (file: File) => void;
  onLoadSample: () => void;
}

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'jobseeker-upload-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function StepUpload({ rows, fileName, busy, fileInputRef, onFileChange, onFileDrop, onLoadSample }: StepUploadProps) {
  function openBrowse() {
    if (busy) return;
    fileInputRef.current?.click();
  }
  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFileDrop(file);
  }
  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }
  function handleDropzoneKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBrowse(); }
  }
  function handleSampleClick() {
    if (busy) return;
    onLoadSample();
  }

  return (
    <section className="wstep active" data-panel="0">
      <div className="wh">
        <div className="eyebrow">Step 1</div>
        <h2>CSV Upload</h2>
        <p>Upload a jobseeker roster (CSV or XLSX). We&apos;ll check for duplicates and validate every row before importing.</p>
      </div>

      <div
        className="dropzone"
        role="button"
        tabIndex={0}
        aria-disabled={busy}
        onClick={openBrowse}
        onKeyDown={handleDropzoneKeyDown}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <i className="ti ti-cloud-upload" />
        <b>Drop your file here or click to browse</b>
        <div style={{ fontSize: 12, marginTop: 4 }}>CSV or XLSX · up to 5,000 rows</div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        style={{ display: 'none' }}
        onChange={onFileChange}
        disabled={busy}
      />

      {rows.length > 0 && (
        <div className="filechip">
          <span className="fi"><i className="ti ti-file-spreadsheet" /></span>
          <div>
            <b>{fileName ?? 'Uploaded file'}</b>
            <span>{rows.length} row{rows.length === 1 ? '' : 's'} detected</span>
          </div>
        </div>
      )}

      <div className="up-note">
        <i className="ti ti-file-download" /> Need the format?{' '}
        <a onClick={downloadTemplate}>Download CSV template</a>
        {' '}· or{' '}
        <a onClick={handleSampleClick} aria-disabled={busy}>use a sample dataset</a>
        {' '}to preview the flow.
      </div>
    </section>
  );
}
