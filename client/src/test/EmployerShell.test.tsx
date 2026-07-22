import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerShell } from '../pages/EmployerPortal/EmployerShell.js';
import { ThemeProvider } from '../theme/ThemeContext.js';

const STORAGE_KEY = 'matchday.auth';

function seedAuth() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    token: 't', user: { id: 'e1', name: 'Acme Corp', email: 'employer@company.com', role: 'employer' },
  }));
}

function mockPortalFetch() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      profile: {
        id: 'e1', name: 'Acme Corp', email: 'employer@company.com', industry: 'Technology',
        size: '51–200', status: 'Active', spoc: 'Asha Nambala', website: 'https://acme.example',
      },
      dashboard: {
        kpis: { activeDrives: 0, upcomingInterviews: 0, totalSlots: 0 },
        calendar: [], registrations: [], shortlist: [],
      },
    }),
  }));
}

function renderShell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/employer/dashboard']}>
          <AuthProvider>
            <Routes>
              <Route
                path="/employer/dashboard"
                element={<EmployerShell><div>DASHBOARD CONTENT</div></EmployerShell>}
              />
              <Route
                path="/employer/drives"
                element={<EmployerShell><div>DRIVES PAGE</div></EmployerShell>}
              />
              <Route
                path="/employer/registrations"
                element={<EmployerShell><div>REGISTRATIONS PAGE</div></EmployerShell>}
              />
              <Route path="/employer/kanban" element={<div>KANBAN PAGE</div>} />
              <Route path="/employer/interviews" element={<div>INTERVIEWS PAGE</div>} />
              <Route path="/employer/coming-soon/:slug" element={<div>COMING SOON PAGE</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('EmployerShell', () => {
  beforeEach(() => {
    localStorage.clear();
    seedAuth();
    mockPortalFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders the sidebar nav items and the content area', () => {
    const { container } = renderShell();
    // Scoped to .sidebar: the topbar's user-menu dropdown also has a "Settings" entry, so an
    // unscoped query for that label would match two buttons.
    const sidebar = within(container.querySelector('.sidebar') as HTMLElement);
    for (const label of ['Dashboard', 'Available Drives', 'Registrations', 'Candidates', 'Interviews', 'Kanban', 'Reports', 'Settings']) {
      expect(sidebar.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(screen.getByText('DASHBOARD CONTENT')).toBeInTheDocument();
  });

  it('navigates to /employer/drives when the Available Drives nav item is clicked', async () => {
    const { container } = renderShell();
    const sidebar = within(container.querySelector('.sidebar') as HTMLElement);
    await userEvent.click(sidebar.getByRole('button', { name: /Available Drives/ }));
    expect(await screen.findByText('DRIVES PAGE')).toBeInTheDocument();
  });

  it('navigates to /employer/registrations when the Registrations nav item is clicked', async () => {
    const { container } = renderShell();
    const sidebar = within(container.querySelector('.sidebar') as HTMLElement);
    await userEvent.click(sidebar.getByRole('button', { name: /Registrations/ }));
    expect(await screen.findByText('REGISTRATIONS PAGE')).toBeInTheDocument();
  });

  it('navigates to /employer/drives when the Candidates nav item is clicked (candidates are viewed per-drive)', async () => {
    const { container } = renderShell();
    const sidebar = within(container.querySelector('.sidebar') as HTMLElement);
    await userEvent.click(sidebar.getByRole('button', { name: /Candidates/ }));
    expect(await screen.findByText('DRIVES PAGE')).toBeInTheDocument();
  });

  it('navigates to /employer/interviews when the Interviews nav item is clicked (resolves to the drive interviews)', async () => {
    const { container } = renderShell();
    const sidebar = within(container.querySelector('.sidebar') as HTMLElement);
    await userEvent.click(sidebar.getByRole('button', { name: /Interviews/ }));
    expect(await screen.findByText('INTERVIEWS PAGE')).toBeInTheDocument();
  });

  it('navigates to /employer/kanban when the Kanban nav item is clicked (resolves to the drive board)', async () => {
    const { container } = renderShell();
    const sidebar = within(container.querySelector('.sidebar') as HTMLElement);
    await userEvent.click(sidebar.getByRole('button', { name: /Kanban/ }));
    expect(await screen.findByText('KANBAN PAGE')).toBeInTheDocument();
  });

  it('clears the auth session when the user menu Log out control is clicked', async () => {
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
