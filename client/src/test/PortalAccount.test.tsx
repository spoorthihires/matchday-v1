import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { Account } from '../pages/Portal/Account.js';
import { ThemeProvider } from '../theme/ThemeContext.js';

const ACCOUNT = {
  name: 'Aarav Kumar', email: 'aarav@example.com', branch: 'CSE', gradYear: 2026,
  source: 'LinkedIn', cgpa: 8.5, institute: 'CBIT', hasPassword: true,
};

function renderAccount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/portal/account']}><AuthProvider><Account /></AuthProvider></MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('Account', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: '1', name: 'Aarav Kumar', email: 'a@b.c', role: 'jobseeker' } }));
    fetchMock = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/me/portal/account/password')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
      }
      if (u.includes('/me/portal/account')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ACCOUNT });
      }
      return Promise.reject(new Error(`unexpected fetch url: ${u}`));
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('renders editable name/branch/source and read-only email/institute/gradYear/cgpa', async () => {
    renderAccount();
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Aarav Kumar'));
    expect(screen.getByLabelText('Branch')).toHaveValue('CSE');
    expect(screen.getByLabelText('Source')).toHaveValue('LinkedIn');
    expect(screen.getByText('aarav@example.com')).toBeInTheDocument();
    expect(screen.getByText('CBIT')).toBeInTheDocument();
    expect(screen.getByText('2026')).toBeInTheDocument();
    expect(screen.getByText('8.5')).toBeInTheDocument();
  });

  it('edits name and submits the profile form, firing PATCH /me/portal/account with the updated name', async () => {
    const user = userEvent.setup();
    renderAccount();
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Aarav Kumar'));

    const nameInput = screen.getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Aarav K');

    fetchMock.mockClear();
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c: unknown[]) => {
        const init = c[1] as RequestInit | undefined;
        return String(c[0]).includes('/me/portal/account') && !String(c[0]).includes('password') && init?.method === 'PATCH';
      });
      expect(call).toBeTruthy();
      const init = (call as unknown[])[1] as RequestInit;
      expect(JSON.parse(init.body as string)).toMatchObject({ name: 'Aarav K' });
    });
  });

  it('submits the change-password form, firing POST /me/portal/account/password with currentPassword and newPassword', async () => {
    const user = userEvent.setup();
    renderAccount();
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Aarav Kumar'));

    await user.type(screen.getByLabelText('Current password'), 'oldpass1');
    await user.type(screen.getByLabelText('New password'), 'newpass123');

    fetchMock.mockClear();
    await user.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('/me/portal/account/password'));
      expect(call).toBeTruthy();
      const init = (call as unknown[])[1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ currentPassword: 'oldpass1', newPassword: 'newpass123' });
    });
  });

  it('surfaces a wrong-current-password error via role=alert', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/me/portal/account/password')) {
        return Promise.resolve({
          ok: false, status: 400,
          json: async () => ({ error: { message: 'Your current password is incorrect', code: 'invalid_password' } }),
        });
      }
      if (u.includes('/me/portal/account')) return Promise.resolve({ ok: true, status: 200, json: async () => ACCOUNT });
      return Promise.reject(new Error(`unexpected fetch url: ${u}`));
    });

    renderAccount();
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Aarav Kumar'));

    await user.type(screen.getByLabelText('Current password'), 'wrong');
    await user.type(screen.getByLabelText('New password'), 'newpass123');
    await user.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Your current password is incorrect'));
  });
});
