import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { TabCandidates } from '../pages/Institutes/detail/TabCandidates.js';
import type { CandidateRow, Paged } from '../types/institutes.js';

const PAGE: Paged<CandidateRow> = {
  items: [
    { id: 'c1', name: 'Ananya Rao', branch: 'CSE', gradYear: 2026, cgpa: 8.7, source: 'Campus Portal', stage: 'Shortlisted', profileCompleted: true },
  ],
  total: 23,
  page: 1,
  limit: 10,
};

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <TabCandidates instituteId="inst-1" />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('TabCandidates', () => {
  beforeEach(() => {
    localStorage.clear();
    // Seed a logged-in session so useInstituteCandidates' `enabled: !!token` fires (mirrors
    // AuthContext's STORAGE_KEY/readStored shape).
    localStorage.setItem('matchday.auth', JSON.stringify({
      token: 'test-token',
      user: { id: 'u1', name: 'Test Admin', email: 'admin@matchday.io', role: 'admin' },
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => PAGE,
    }));
  });

  it('renders a candidate row with name and stage, and the pager shows the total', async () => {
    renderTab();

    expect(await screen.findByText('Ananya Rao')).toBeInTheDocument();
    expect(screen.getByText('Shortlisted')).toBeInTheDocument();

    // Pager shows "Showing 1–1 of 23 candidates" — assert the total renders inside the pinfo.
    expect(screen.getByText('23')).toBeInTheDocument();
    expect(screen.getByText(/candidates$/)).toBeInTheDocument();
  });
});
