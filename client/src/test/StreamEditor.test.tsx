import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { StreamEditorModal } from '../pages/Streams/StreamEditorModal.js';

function renderModal(onClose: () => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><AuthProvider><StreamEditorModal mode="create" onClose={onClose} /></AuthProvider></QueryClientProvider>);
}

describe('StreamEditorModal', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Admin', email: 'a@b.io', role: 'admin' } }));
    vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
      if (url.includes('/streams') && (opts?.method ?? 'GET') === 'POST') return Promise.resolve({ ok: true, status: 201, json: async () => ({ _id: 's-new' }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('adds a skill tag, requires a name, then POSTs a canonical-flow payload', async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const user = userEvent.setup();

    // add a skill tag
    const skillIn = screen.getByPlaceholderText(/Type a skill and press Enter/i);
    await user.type(skillIn, 'React{Enter}');
    expect(screen.getByText('React')).toBeInTheDocument();

    // toggle flow chips out of order: click TARA then MCQ (both are chips)
    await user.click(screen.getByRole('button', { name: /^TARA$/ }));
    await user.click(screen.getByRole('button', { name: /^MCQ$/ }));

    // name required: save blocked first
    await user.click(screen.getByRole('button', { name: /Save stream/i }));
    expect(onClose).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Stream name/i), 'Frontend Engineering');
    await user.click(screen.getByRole('button', { name: /Save stream/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const post = fetchMock.mock.calls.find(([u, o]) => typeof u === 'string' && u.includes('/streams') && (o as RequestInit | undefined)?.method === 'POST');
    const b = JSON.parse((post![1] as RequestInit).body as string);
    expect(b.name).toBe('Frontend Engineering');
    expect(b.skills).toContain('React');
    // flow canonicalized regardless of click order
    expect(b.flow).toEqual(['MCQ', 'TARA']);
  });
});
