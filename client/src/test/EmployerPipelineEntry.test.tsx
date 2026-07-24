import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { ThemeProvider } from '../theme/ThemeContext.js';
import { EmployerPipelineEntry } from '../pages/EmployerPortal/EmployerPipelineEntry.js';

function seedAuth() {
  localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'e1', name: 'Acme', email: 'e@c.com', role: 'employer' } }));
}
function mockRegs(items: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items }) })));
}
function renderEntry() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/employer/kanban']}>
          <AuthProvider>
            <Routes>
              <Route path="/employer/kanban" element={<EmployerPipelineEntry target="board" title="Live Drive" subtitle="x" />} />
              <Route path="/employer/drives/:id/board" element={<div>BOARD PAGE</div>} />
              <Route path="/employer/drives" element={<div>DRIVES MARKETPLACE</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('EmployerPipelineEntry', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

  it('redirects straight to the board when there is exactly one approved drive', async () => {
    seedAuth();
    mockRegs([
      { id: 'r1', driveId: 'd1', driveName: 'Alpha', status: 'Approved' },
      { id: 'r2', driveId: 'd2', driveName: 'Beta', status: 'Pending review' },
    ]);
    renderEntry();
    await waitFor(() => expect(screen.getByText('BOARD PAGE')).toBeInTheDocument());
  });

  it('shows a drive picker when there are multiple approved drives', async () => {
    seedAuth();
    mockRegs([
      { id: 'r1', driveId: 'd1', driveName: 'Alpha', status: 'Approved' },
      { id: 'r2', driveId: 'd2', driveName: 'Beta', status: 'Approved' },
    ]);
    renderEntry();
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Open board/ })).toHaveLength(2);
  });

  it('shows an empty state (Browse drives) when there are no approved drives', async () => {
    seedAuth();
    mockRegs([{ id: 'r1', driveId: 'd1', driveName: 'Alpha', status: 'Pending review' }]);
    renderEntry();
    await waitFor(() => expect(screen.getByRole('button', { name: /Browse drives/ })).toBeInTheDocument());
  });
});
