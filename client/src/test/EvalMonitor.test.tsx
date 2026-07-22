import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EvalMonitorPage } from '../pages/Evaluations/monitor/EvalMonitorPage.js';
import { ThemeProvider } from '../theme/ThemeContext.js';
import type { MonitorResponse } from '../types/evaluations.js';

const PAYLOAD: MonitorResponse = {
  candidates: [
    { id: 'a', code: 'C-A', name: 'Aa Bb', institute: 'VNR', contest: 'Frontend · Jul cohort', employer: 'Nexatech Labs', stage: 9, score: 88, minsAgo: 5 },
    { id: 'b', code: 'C-B', name: 'Cc Dd', institute: 'CBIT', contest: 'Backend · Jul cohort', employer: 'Quantbridge', stage: 3, score: 61, minsAgo: 20 },
    { id: 'c', code: 'C-C', name: 'Ee Ff', institute: 'VNR', contest: 'Frontend · Jul cohort', employer: 'Helioserv', stage: 2, score: 55, minsAgo: 40 },
  ],
  contests: ['Frontend · Jul cohort', 'Backend · Jul cohort'], employers: ['Nexatech Labs', 'Quantbridge', 'Helioserv'], institutes: ['CBIT', 'VNR'],
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider><MemoryRouter><QueryClientProvider client={qc}><AuthProvider><EvalMonitorPage /></AuthProvider></QueryClientProvider></MemoryRouter></ThemeProvider>,
  );
}

describe('EvalMonitorPage', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Admin', email: 'a@b.io', role: 'admin' } }));
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => PAYLOAD })));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('renders KPIs and the candidate table from the payload', async () => {
    renderPage();
    expect(await screen.findByText('Aa Bb')).toBeInTheDocument();
    // Use only UNIQUE KPI labels — 'Match Ready' also appears in the stage strip/funnel/badges,
    // so scope by the unique 'In Pipeline' / 'Awaiting Evaluation' labels instead.
    const pipeline = screen.getByText('In Pipeline').closest('.kpi');
    expect(within(pipeline as HTMLElement).getByText('3')).toBeInTheDocument();   // total
    const awaiting = screen.getByText('Awaiting Evaluation').closest('.kpi');
    expect(within(awaiting as HTMLElement).getByText('1')).toBeInTheDocument();   // pending = counts[3]=1
  });

  it('clicking a stage card filters the table to that stage', async () => {
    renderPage();
    await screen.findByText('Aa Bb');
    const user = userEvent.setup();
    // click the "Match Ready" stage card (stage 9, via its .sc-l label) — only the stage-9 candidate remains
    await user.click(screen.getByText('Match Ready', { selector: '.sc-l' }));
    expect(screen.getByText('Aa Bb')).toBeInTheDocument();
    expect(screen.queryByText('Cc Dd')).not.toBeInTheDocument();
  });

  it('advances a candidate on the live tick (fake timers)', async () => {
    vi.useFakeTimers();
    // random=0 → picks the first not-yet-ready candidate in array order (b, "Cc Dd", stage 3 → 4)
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0);
    renderPage();
    // Flush the initial query: with fake timers active, the fetch → apiFetch → useQuery →
    // setState chain resolves over several microtask hops (more than a single
    // advanceTimersByTimeAsync(0) flushes), so pump it a few times inside act() until the
    // seeded candidates land in local state.
    await act(async () => {
      for (let i = 0; i < 5; i += 1) { await vi.advanceTimersByTimeAsync(0); }
    });
    // before the tick, b's row badge is "MCQ Pending" (stage 3)
    expect(screen.getByText('MCQ Pending', { selector: '.stbadge' })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(3600); });   // one ~3.5s tick
    // after the tick b advanced 3→4: the MCQ Pending badge is gone, MCQ Completed appears
    expect(screen.getByText('MCQ Completed', { selector: '.stbadge' })).toBeInTheDocument();
    expect(screen.queryByText('MCQ Pending', { selector: '.stbadge' })).not.toBeInTheDocument();
    // total unchanged — candidates advance, they don't leave the pipeline
    const pipeline = screen.getByText('In Pipeline').closest('.kpi');
    expect(within(pipeline as HTMLElement).getByText('3')).toBeInTheDocument();
    rand.mockRestore();
  });
});
