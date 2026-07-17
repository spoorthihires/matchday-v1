import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { StepBasics } from '../pages/Drives/wizard/StepBasics.js';
import { blankDriveModel } from '../pages/Drives/wizard/DriveWizard.js';
import type { DriveInput } from '../types/drives.js';

const STREAM = {
  id: 'str-1', code: 'STR-1', name: 'Frontend Engineering', parent: 'Engineering', label: '',
  skills: [], good: [], flow: ['MCQ', 'Coding', 'TARA'], cutoff: 65, cgpa: 6.5, backlogs: 1,
  grad: [], branches: [], sources: [], status: 'Active', version: '1.0', versions: [], drives: 0,
  createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
};

function renderStep(onChange: (p: Partial<DriveInput>) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><AuthProvider>
      <StepBasics model={blankDriveModel()} onChange={onChange} errors={[]} />
    </AuthProvider></QueryClientProvider>,
  );
}

describe('StepBasics — stream profile picker', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Admin', email: 'a@b.io', role: 'admin' } }));
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/streams')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [STREAM] }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('selecting a stream profile sets streamId on the model', async () => {
    const onChange = vi.fn();
    renderStep(onChange);
    const user = userEvent.setup();
    const select = await screen.findByLabelText(/Stream profile/i);
    // The stream list loads async (React Query); wait for the real option to render before
    // selecting it — otherwise selectOptions races the fetch and only sees "No stream profile".
    await screen.findByRole('option', { name: 'Frontend Engineering' });
    await user.selectOptions(select, 'str-1');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ streamId: 'str-1' }));
  });
});
