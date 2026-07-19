import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { EmployerLogin } from '../pages/EmployerPortal/EmployerLogin.js';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/employer/login']}>
        <AuthProvider>
          <Routes>
            <Route path="/employer/login" element={<EmployerLogin />} />
            <Route path="/employer/mfa" element={<div>EMPLOYER MFA</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployerLogin', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('shows an inline error message on a 401', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 401,
      json: async () => ({ error: { message: 'Invalid credentials', code: 'auth' } }),
    });
    renderPage();
    await userEvent.type(screen.getByLabelText('Email'), 'employer@company.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials'));
  });

  it('navigates an employer to /employer/mfa after a successful login', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        token: 't', user: { id: '1', name: 'Acme Corp', email: 'employer@company.com', role: 'employer' },
      }),
    });
    renderPage();
    await userEvent.type(screen.getByLabelText('Email'), 'employer@company.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Employer123!');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(screen.getByText('EMPLOYER MFA')).toBeInTheDocument());
  });
});
