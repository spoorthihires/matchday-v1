import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { Portal } from '../pages/Portal/index.js';
import { ThemeProvider } from '../theme/ThemeContext.js';

const PAYLOAD = {
  profile: { id: '1', code: 'C-ABC123', name: 'Aarav Kumar', email: 'a@b.c', institute: 'CBIT', branch: 'CSE', gradYear: 2026, cgpa: 8.5 },
  journey: { stage: 'Offer', stages: ['Applied', 'Screened', 'Evaluated', 'MatchReady', 'Shortlisted', 'Offer', 'Joined'], matchReadinessPct: 92, evaluationLabel: 'Completed', offerStatus: 'Offer sent' },
  drives: [{ id: 'd1', name: 'CSE Drive', domain: 'Backend', employers: ['Acme Corp'], eventDates: ['2026-08-05T04:30:00.000Z'], statusTag: 'Selected' }],
};

function renderPortal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter><AuthProvider><Portal /></AuthProvider></MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('Portal', () => {
  beforeEach(() => {
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: '1', name: 'Aarav Kumar', email: 'a@b.c', role: 'jobseeker' } }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => PAYLOAD }));
  });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('renders the journey, status, and eligible drives', async () => {
    renderPortal();
    await waitFor(() => expect(screen.getByText('CSE Drive')).toBeInTheDocument());
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.getByText(/My Journey/)).toBeInTheDocument();
  });
});
