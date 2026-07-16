import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { LoginPage } from '../auth/LoginPage.js';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><AuthProvider><LoginPage /></AuthProvider></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('shows an error message when login fails', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 401,
      json: async () => ({ error: { message: 'Invalid credentials', code: 'auth' } }),
    });
    renderPage();
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials'));
  });

  it('navigates a jobseeker to /portal after login', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ token: 't', user: { id: '1', name: 'Seeker', email: 's@x.z', role: 'jobseeker' } }),
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/login']}>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/portal" element={<div>SEEKER PORTAL</div>} />
              <Route path="/" element={<div>ADMIN CONSOLE</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await userEvent.type(screen.getByLabelText('Email'), 's@x.z');
    await userEvent.type(screen.getByLabelText('Password'), 'Seeker123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText('SEEKER PORTAL')).toBeInTheDocument());
  });
});
