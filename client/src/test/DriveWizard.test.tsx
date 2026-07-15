import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { DriveWizard } from '../pages/Drives/wizard/DriveWizard.js';

function renderWizard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AuthProvider>
          <DriveWizard mode="create" onClose={vi.fn()} />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DriveWizard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('blocks Continue on step 1 when the name is empty and shows the error', async () => {
    renderWizard();
    // blankDriveModel() already defaults name to '', so no need to clear an input first.
    const next = screen.getByRole('button', { name: /continue/i });
    await userEvent.click(next);
    expect(await screen.findByText(/drive name is required/i)).toBeInTheDocument();
    // Continue must not have advanced past step 1 — the Basic Info heading is still shown.
    expect(screen.getByRole('heading', { name: 'Basic Info' })).toBeInTheDocument();
  });

  it('allows Continue once a name is entered', async () => {
    renderWizard();
    const nameInput = screen.getByPlaceholderText(/e\.g\. frontend engineers/i);
    await userEvent.type(nameInput, 'Frontend Engineers · July cohort');
    const next = screen.getByRole('button', { name: /continue/i });
    await userEvent.click(next);
    expect(screen.getByRole('heading', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.queryByText(/drive name is required/i)).not.toBeInTheDocument();
  });
});
