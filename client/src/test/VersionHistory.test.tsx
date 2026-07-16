import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { VersionHistoryModal } from '../pages/Templates/VersionHistoryModal.js';
import { baseSections } from '../pages/Templates/templateUtils.js';
import type { TemplateItem } from '../types/templates.js';

const template: TemplateItem = {
  id: 't1', code: 'TPL-ABC', name: 'Data Analyst', domain: 'Data / Analytics',
  status: 'Active', usedBy: 6, sections: baseSections(), version: '2.1',
  versions: [
    { v: '2.1', date: '2026-07-10T00:00:00.000Z', by: 'Sharath P.', note: 'Raised MCQ weightage to 30%' },
    { v: '2.0', date: '2026-06-22T00:00:00.000Z', by: 'Asha N.', note: 'Added assignment stage' },
  ],
  createdAt: '2026-05-30T00:00:00.000Z', updatedAt: '2026-07-10T00:00:00.000Z',
};

function renderModal(onClose: () => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider><VersionHistoryModal template={template} onClose={onClose} /></AuthProvider>
    </QueryClientProvider>,
  );
}

describe('VersionHistoryModal', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({
      token: 'test-token', user: { id: 'u1', name: 'Test Admin', email: 'a@b.io', role: 'admin' },
    }));
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({}) })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders entries, marks the current, and restores an older one', async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const user = userEvent.setup();
    expect(screen.getByText('Raised MCQ weightage to 30%')).toBeInTheDocument();
    expect(screen.getByText('Added assignment stage')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Jul 10, 2026')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Restore/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const post = fetchMock.mock.calls.find(([u, o]) => typeof u === 'string' && u.includes('/templates/t1/restore') && (o as RequestInit | undefined)?.method === 'POST');
    expect(post).toBeTruthy();
    expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({ v: '2.0' });
  });
});
