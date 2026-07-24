import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { UploadWizard } from '../pages/Jobseekers/upload/UploadWizard.js';

// Mirrors the SAMPLE_ROWS seeded in upload/template.ts (Aarav Sharma / Diya Reddy / a repeated
// Aarav Sharma row) — the server's analyze() would flag the third row as a within-file email
// duplicate; this mock reproduces that shape instead of hitting a real server.
const PREVIEW_RESPONSE = {
  rows: [
    {
      index: 0,
      data: { name: 'Aarav Sharma', email: 'aarav@cbit.edu', instituteId: 'inst-1', instituteName: 'CBIT', branch: 'CSE', gradYear: 2026, cgpa: 8.4, source: 'Campus' },
      valid: true, errors: [], dupe: false,
    },
    {
      index: 1,
      data: { name: 'Diya Reddy', email: 'diya@cbit.edu', instituteId: 'inst-1', instituteName: 'CBIT', branch: 'IT', gradYear: 2026, cgpa: 9.1, source: 'Campus' },
      valid: true, errors: [], dupe: false,
    },
    {
      index: 2,
      data: { name: 'Aarav Sharma', email: 'aarav@cbit.edu', instituteId: 'inst-1', instituteName: 'CBIT', branch: 'CSE', gradYear: 2026, cgpa: 8.4, source: 'Campus' },
      valid: true, errors: [], dupe: true, dupeReason: 'Duplicate email within file',
    },
  ],
  summary: { total: 3, valid: 3, invalid: 0, duplicates: 1, willImport: 2 },
};

const COMMIT_RESPONSE = { imported: 2, skipped: 1, skippedReasons: { duplicates: 1, invalid: 0 } };

// What a re-preview should look like once the duplicate row (index 2) is removed from the
// batch: the remaining two rows keep their original indices and neither is flagged anymore.
const SECOND_PREVIEW_RESPONSE = {
  rows: [
    {
      index: 0,
      data: { name: 'Aarav Sharma', email: 'aarav@cbit.edu', instituteId: 'inst-1', instituteName: 'CBIT', branch: 'CSE', gradYear: 2026, cgpa: 8.4, source: 'Campus' },
      valid: true, errors: [], dupe: false,
    },
    {
      index: 1,
      data: { name: 'Diya Reddy', email: 'diya@cbit.edu', instituteId: 'inst-1', instituteName: 'CBIT', branch: 'IT', gradYear: 2026, cgpa: 9.1, source: 'Campus' },
      valid: true, errors: [], dupe: false,
    },
  ],
  summary: { total: 2, valid: 2, invalid: 0, duplicates: 0, willImport: 2 },
};

function renderWizard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <UploadWizard onClose={vi.fn()} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('UploadWizard', () => {
  beforeEach(() => {
    localStorage.clear();
    // Seed a logged-in session so the preview/commit mutations' `token` (from useAuth) is
    // populated (mirrors AuthContext's STORAGE_KEY/readStored shape — see InstituteDetail.test.tsx).
    localStorage.setItem('matchday.auth', JSON.stringify({
      token: 'test-token',
      user: { id: 'u1', name: 'Test Admin', email: 'admin@matchday.io', role: 'admin' },
    }));
    // Routes on the request URL: /import/preview vs /import/commit get their own canned payload,
    // since a single wizard run hits both endpoints with different expected responses. The
    // preview endpoint is further sequenced by call count: the first preview (post-upload) sees
    // the seeded duplicate, and any re-preview after that (e.g. StepDuplicates' Remove action)
    // sees the duplicate-free follow-up payload — mirroring what a real server would return once
    // the offending row is dropped from the batch.
    let previewCalls = 0;
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/import/preview')) {
        previewCalls += 1;
        const body = previewCalls === 1 ? PREVIEW_RESPONSE : SECOND_PREVIEW_RESPONSE;
        return Promise.resolve({ ok: true, status: 200, json: async () => body });
      }
      if (url.includes('/import/commit')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => COMMIT_RESPONSE });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('walks the sample dataset through duplicates, validation and summary to a completed import', async () => {
    renderWizard();
    const user = userEvent.setup();

    // Step 1 (CSV Upload): the sample-dataset link sets rows without needing a real File.
    await user.click(screen.getByText(/use a sample dataset/i));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    // Step 2 (Duplicate Check): the seeded dup from the mocked preview payload is flagged, with
    // a Remove action available.
    expect(await screen.findByRole('heading', { name: 'Duplicate Check' })).toBeInTheDocument();
    expect(screen.getByText('Duplicate email within file')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /continue/i }));

    // Step 3 (Validation): no invalid rows in the mocked payload.
    expect(await screen.findByRole('heading', { name: 'Validation' })).toBeInTheDocument();
    expect(screen.getByText(/all rows valid/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /continue/i }));

    // Step 4 (Import Summary): willImport (2) rendered as a stat tile.
    expect(await screen.findByRole('heading', { name: 'Import Summary' })).toBeInTheDocument();
    const willImportTile = screen.getByText('Will import').closest('.kpi') as HTMLElement;
    expect(within(willImportTile).getByText('2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /import 2 jobseekers/i }));

    // Step 5 (Completion Report): imported count from the mocked commit response.
    expect(await screen.findByRole('heading', { name: 'Completion Report' })).toBeInTheDocument();
    const importedTile = screen.getByText('Imported').closest('.kpi') as HTMLElement;
    expect(within(importedTile).getByText('2')).toBeInTheDocument();
  });

  it('removing a duplicate row re-previews and clears it from the duplicates table', async () => {
    renderWizard();
    const user = userEvent.setup();
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const previewCallCount = () =>
      fetchMock.mock.calls.filter(([url]) => typeof url === 'string' && url.includes('/import/preview')).length;

    await user.click(screen.getByText(/use a sample dataset/i));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByRole('heading', { name: 'Duplicate Check' })).toBeInTheDocument();
    expect(screen.getByText('Duplicate email within file')).toBeInTheDocument();
    expect(previewCallCount()).toBe(1);

    // Remove the flagged duplicate row (T8's onRemoveRow) — this re-previews the trimmed batch
    // in place (T7's stale-preview race guard) without leaving the Duplicate Check step.
    await user.click(screen.getByRole('button', { name: /remove/i }));

    // Second preview fetch fires against the mocked duplicate-free follow-up payload, and the
    // table/banner update to reflect it — no more Remove button, no more dupe reason text.
    expect(await screen.findByText(/no duplicates found/i)).toBeInTheDocument();
    expect(screen.queryByText('Duplicate email within file')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    expect(previewCallCount()).toBe(2);
  });
});
