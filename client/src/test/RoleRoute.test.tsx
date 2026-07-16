import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { RoleRoute } from '../auth/RoleRoute.js';

function seedAuth(role: string) {
  localStorage.setItem('matchday.auth', JSON.stringify({
    token: 't', user: { id: '1', name: 'X', email: 'x@y.z', role },
  }));
}

function renderAt(role: 'admin' | 'jobseeker') {
  return render(
    <MemoryRouter initialEntries={['/portal']}>
      <AuthProvider>
        <Routes>
          <Route path="/portal" element={<RoleRoute role="jobseeker"><div>PORTAL</div></RoleRoute>} />
          <Route path="/" element={<div>ADMIN HOME</div>} />
          <Route path="/login" element={<div>LOGIN</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('RoleRoute', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('renders children when the role matches', () => {
    seedAuth('jobseeker');
    renderAt('jobseeker');
    expect(screen.getByText('PORTAL')).toBeInTheDocument();
  });

  it('redirects a mismatched role away from the route', () => {
    seedAuth('admin');
    renderAt('jobseeker');
    expect(screen.getByText('ADMIN HOME')).toBeInTheDocument();
  });

  it('redirects to /login without a token', () => {
    renderAt('jobseeker');
    expect(screen.getByText('LOGIN')).toBeInTheDocument();
  });
});
