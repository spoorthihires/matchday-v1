import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerDashboard } from '../pages/EmployerPortal/EmployerDashboard.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({
    token: 't', user: { id: 'e1', name: 'Acme Corp', email: 'employer@company.com', role: 'employer' },
  }));
}

const REPORT = {
  scope: 'all',
  drives: [],
  funnel: [
    { stage: 'Recommended', count: 20, conversionPct: 100 },
    { stage: 'Shortlisted', count: 16, conversionPct: 80 },
    { stage: 'Confirmed', count: 12, conversionPct: 75 },
    { stage: 'Interviewed', count: 8, conversionPct: 67 },
    { stage: 'Offered', count: 4, conversionPct: 50 },
    { stage: 'Accepted', count: 3, conversionPct: 75 },
    { stage: 'Joined', count: 2, conversionPct: 67 },
  ],
  kpis: { recommended: 20, shortlisted: 16, interviewsScheduled: 8, offersSent: 4, offersAccepted: 3, dropOffPct: 33, avgMatchScore: 72 },
};

const ZERO_REPORT = {
  scope: 'all',
  drives: [],
  funnel: [{ stage: 'Recommended', count: 0, conversionPct: 100 }],
  kpis: { recommended: 0, shortlisted: 0, interviewsScheduled: 0, offersSent: 0, offersAccepted: 0, dropOffPct: 0, avgMatchScore: 0 },
};

function portalPayload(status: 'Pending' | 'Active', dashboardOverrides: Record<string, unknown> = {}) {
  return {
    profile: {
      id: 'e1', name: 'Acme Corp', email: 'employer@company.com', industry: 'Technology',
      size: '51–200', status, spoc: 'Asha Nambala', website: 'https://acme.example',
    },
    dashboard: {
      kpis: { activeDrives: 4, upcomingInterviews: 6, totalSlots: 9, activeRegistrations: 3, upcomingMatchDays: 2 },
      calendar: [],
      registrations: [],
      shortlist: [],
      notifications: [],
      notificationsUnread: 0,
      activeDrives: [
        { id: 'd1', name: 'Data Analyst MatchDay', status: 'Approved', primaryEventDate: '2026-07-22T00:00:00.000Z', sharedCount: 24 },
        { id: 'd2', name: 'ML Engineer MatchDay', status: 'Pending review', primaryEventDate: null, sharedCount: 0 },
      ],
      pendingActions: [
        { id: 'slot:d1', text: 'Book a Wednesday slot — Data Analyst MatchDay', kind: 'slot', urgency: 'today' },
        { id: 'shortlist:d2', text: 'Shortlist jobseekers — ML Engineer MatchDay', kind: 'shortlist', urgency: 'soon' },
      ],
      calendarEvents: [],
      ...dashboardOverrides,
    },
  };
}

function mockFetch(status: 'Pending' | 'Active', opts: { dashboardOverrides?: Record<string, unknown>; report?: unknown } = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/reports')) {
      return { ok: true, status: 200, json: async () => (opts.report ?? REPORT) };
    }
    return { ok: true, status: 200, json: async () => portalPayload(status, opts.dashboardOverrides) };
  });
  vi.stubGlobal('fetch', fetchMock);
}

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AuthProvider>
          <EmployerDashboard />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerDashboard', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders the greeting, the 8-tile KPI grid, and the Pending banner for a Pending employer', async () => {
    seedAuth();
    mockFetch('Pending');
    renderDashboard();

    await waitFor(() => expect(screen.getByText('Welcome back, Asha Nambala')).toBeInTheDocument());
    // Exact match (with the trailing period) so this can't accidentally match the "Pending
    // review" status-pill text on the ML Engineer MatchDay active-drive row below.
    expect(screen.getByText('Pending review.')).toBeInTheDocument();

    // KPI tiles: scope each value lookup to its own `.kpi` tile so numbers (and even labels,
    // e.g. "Shortlisted" is both a KPI label AND a hiring-funnel stage name) that repeat
    // elsewhere on the page can't cause a false match -- only the label span with a `.kpi`
    // ancestor is the real tile; the funnel's `.flbl` span with the same text has none.
    const tile = (label: string) => {
      const el = screen.getAllByText(label).map((m) => m.closest('.kpi')).find((c): c is HTMLElement => c !== null);
      if (!el) throw new Error(`No .kpi tile found for label "${label}"`);
      return el;
    };
    await waitFor(() => expect(within(tile('Active registrations')).getByText('3')).toBeInTheDocument());
    expect(within(tile('Upcoming MatchDays')).getByText('2')).toBeInTheDocument();
    expect(within(tile('Jobseekers shared')).getByText('20')).toBeInTheDocument(); // reports.kpis.recommended
    expect(within(tile('Shortlisted')).getByText('16')).toBeInTheDocument(); // reports.kpis.shortlisted
    expect(within(tile('Interviews scheduled')).getByText('6')).toBeInTheDocument(); // dashboard.kpis.upcomingInterviews
    expect(within(tile('Total slots')).getByText('9')).toBeInTheDocument();
    expect(within(tile('Offers sent')).getByText('4')).toBeInTheDocument(); // reports.kpis.offersSent
    // Joined sources the LAST funnel stage's count (2), not reports.kpis.offersAccepted (3) --
    // proves the funnel-stage precedence the brief specifies, not the fallback.
    expect(within(tile('Joined')).getByText('2')).toBeInTheDocument();

    // Hiring funnel
    expect(screen.getByText('Hiring funnel')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View reports/ })).toHaveAttribute('href', '/employer/reports');
    // The funnel row's pct is relative to the FIRST stage's count (20), per the brief --
    // Confirmed(12)/Recommended(20) = 60% -- NOT the mock's own `conversionPct` field (75,
    // which means "% of the previous stage" and this card intentionally does not use).
    const confirmedRow = screen.getByText('Confirmed').closest('.funnel-row') as HTMLElement;
    expect(within(confirmedRow).getByText('12')).toBeInTheDocument();
    expect(within(confirmedRow).getByText('60%')).toBeInTheDocument();

    // Active drives
    expect(screen.getByRole('link', { name: /All registrations/ })).toHaveAttribute('href', '/employer/registrations');
    const driveRow = screen.getByText('Data Analyst MatchDay').closest('.drive-row') as HTMLElement;
    expect(within(driveRow).getByText('Approved')).toBeInTheDocument();
    expect(within(driveRow).getByText('24 shared')).toBeInTheDocument();
    const pendingDriveRow = screen.getByText('ML Engineer MatchDay').closest('.drive-row') as HTMLElement;
    expect(within(pendingDriveRow).getByText('Pending review')).toBeInTheDocument();
    expect(within(pendingDriveRow).getByText('Date TBD')).toBeInTheDocument();

    // Pending actions
    expect(screen.getByText('2 to do')).toBeInTheDocument();
    const slotAction = screen.getByText(/Book a Wednesday slot/).closest('.action-row') as HTMLElement;
    expect(within(slotAction).getByText('Due today')).toBeInTheDocument();
    expect(within(slotAction).getByRole('link', { name: 'Book slot' })).toHaveAttribute('href', '/employer/registrations');
    const shortlistAction = screen.getByText(/Shortlist jobseekers/).closest('.action-row') as HTMLElement;
    expect(within(shortlistAction).getByText('Coming up')).toBeInTheDocument();
    expect(within(shortlistAction).getByRole('link', { name: 'Shortlist' })).toHaveAttribute('href', '/employer/drives');
  });

  it('does not show the Pending banner for an Active employer', async () => {
    seedAuth();
    mockFetch('Active');
    renderDashboard();

    await waitFor(() => expect(screen.getByText('Welcome back, Asha Nambala')).toBeInTheDocument());
    expect(screen.queryByText('Pending review.')).not.toBeInTheDocument();
  });

  it('shows honest empty-state hints when the funnel, active drives, and pending actions are all empty', async () => {
    seedAuth();
    mockFetch('Active', {
      dashboardOverrides: { activeDrives: [], pendingActions: [] },
      report: ZERO_REPORT,
    });
    renderDashboard();

    await waitFor(() => expect(screen.getByText('Welcome back, Asha Nambala')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/No pipeline data yet/)).toBeInTheDocument());
    expect(screen.getByText(/No active drives yet/)).toBeInTheDocument();
    expect(screen.getByText("You're all caught up 🎉")).toBeInTheDocument();
    expect(screen.getByText('0 to do')).toBeInTheDocument();

    // Copy must say "jobseeker(s)", never "candidate" (product-wide renaming rule).
    expect(screen.queryByText(/candidate/i)).not.toBeInTheDocument();
  });
});
