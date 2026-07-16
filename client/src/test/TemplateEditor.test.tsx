import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { TemplateEditorModal } from '../pages/Templates/TemplateEditorModal.js';

function renderEditor(onClose: () => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <TemplateEditorModal mode="create" onClose={onClose} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('TemplateEditorModal', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({
      token: 'test-token',
      user: { id: 'u1', name: 'Test Admin', email: 'admin@matchday.io', role: 'admin' },
    }));
    vi.stubGlobal('fetch', vi.fn((url: string, opts?: RequestInit) => {
      const method = (opts?.method ?? 'GET').toUpperCase();
      if (url.includes('/templates') && method === 'POST') {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ _id: 't-new' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the assessment tab by default and switches to Scoring with a 100% good total', async () => {
    renderEditor(() => {});
    const user = userEvent.setup();
    expect(screen.getByText(/Assessment structure/i)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Scoring/i }));
    const total = screen.getByText('100%');
    expect(total).toHaveClass('good');
  });

  it('flips the total to bad when weightage no longer sums to 100', async () => {
    renderEditor(() => {});
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /Scoring/i }));
    fireEvent.change(screen.getByLabelText('MCQ'), { target: { value: '50' } });   // 50+35+30+15 = 130
    expect(screen.getByText('130%')).toHaveClass('bad');
  });

  it('requires a name, then POSTs the full payload and closes', async () => {
    const onClose = vi.fn();
    renderEditor(onClose);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Save template/i }));
    expect(fetch as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalledWith(
      expect.stringContaining('/templates'), expect.objectContaining({ method: 'POST' }),
    );

    await user.type(screen.getByLabelText(/Template name/i), 'My Template');
    await user.click(screen.getByRole('button', { name: /Save template/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const post = fetchMock.mock.calls.find(([u, o]) => typeof u === 'string' && u.includes('/templates') && (o as RequestInit | undefined)?.method === 'POST');
    expect(post).toBeTruthy();
    const body = JSON.parse((post![1] as RequestInit).body as string);
    expect(body.name).toBe('My Template');
    expect(body.domain).toBe('Data / Analytics');
    expect(body.status).toBe('Active');
    expect(body.sections.weightage).toEqual({ MCQ: 20, Coding: 35, TARA: 30, Assignment: 15 });
    expect(body.sections.kanban).toHaveLength(9);
  });
});
