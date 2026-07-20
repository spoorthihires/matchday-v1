import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EvalConfigModal, type EvalConfigModalProps } from '../pages/Evaluations/EvalConfigModal.js';

function renderModal(onClose: () => void, extra: Partial<EvalConfigModalProps> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><AuthProvider><EvalConfigModal mode="create" onClose={onClose} {...extra} /></AuthProvider></QueryClientProvider>);
}

describe('EvalConfigModal', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Admin', email: 'a@b.io', role: 'admin' } }));
    vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
      if (url.includes('/eval-configs') && (opts?.method ?? 'GET') === 'POST') return Promise.resolve({ ok: true, status: 201, json: async () => ({ _id: 'e-new' }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('hides the threshold row until Auto-qualification is on', async () => {
    renderModal(() => {});
    expect(screen.queryByLabelText(/Auto-qualify when score/i)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByLabelText(/Auto-qualification/i));
    expect(screen.getByLabelText(/Auto-qualify when score/i)).toBeInTheDocument();
  });
  it('requires a name then POSTs the config payload and closes', async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Save configuration/i }));
    expect(onClose).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/Configuration name/i), 'My MCQ');
    await user.click(screen.getByRole('button', { name: /Save configuration/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const post = fetchMock.mock.calls.find(([u, o]) => typeof u === 'string' && u.includes('/eval-configs') && (o as RequestInit | undefined)?.method === 'POST');
    const b = JSON.parse((post![1] as RequestInit).body as string);
    expect(b).toEqual(expect.objectContaining({ name: 'My MCQ', type: 'MCQ', enabled: true, passing: 60, attempts: 2 }));
  });

  it('pre-selects the assessment type from initialType', async () => {
    renderModal(() => {}, { initialType: 'Coding' });
    expect(screen.getByLabelText(/Assessment type/i)).toHaveValue('Coding');
  });

  it('calls onSaved with the created config before closing', async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    renderModal(onClose, { onSaved, initialType: 'Coding' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Configuration name/i), 'New Coding cfg');
    await user.click(screen.getByRole('button', { name: /Save configuration/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ _id: 'e-new' }));
  });
});
