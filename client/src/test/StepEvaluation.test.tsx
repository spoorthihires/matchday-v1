import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { StepEvaluation } from '../pages/Drives/wizard/StepEvaluation.js';
import { blankDriveModel } from '../pages/Drives/wizard/DriveWizard.js';
import type { DriveInput } from '../types/drives.js';

const TEMPLATE = {
  id: 'tpl-1', code: 'TPL-1', name: 'Data Analyst', domain: 'Data / Analytics', status: 'Active', usedBy: 0,
  sections: { assessment: { mcq: true, coding: false, tara: true, assignments: true }, weightage: {}, matching: {}, kanban: [], notifications: [], privacy: {} },
  version: '1.0', versions: [], createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
};

const MCQ_CFG = {
  id: 'cfg-1', code: 'EVC-1', name: 'Standard MCQ', type: 'MCQ', enabled: true,
  passing: 60, attempts: 2, retake: 'After cooldown', cooldown: 2, validity: 90, autoQual: true,
  threshold: 70, contests: 0, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
};

function renderStep(onChange: (p: Partial<DriveInput>) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><AuthProvider>
      <StepEvaluation model={blankDriveModel()} onChange={onChange} errors={[]} />
    </AuthProvider></QueryClientProvider>,
  );
}

describe('StepEvaluation — template picker', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('matchday.auth', JSON.stringify({ token: 't', user: { id: 'u1', name: 'Admin', email: 'a@b.io', role: 'admin' } }));
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/templates')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [TEMPLATE] }) });
      if (url.includes('/eval-configs')) return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [MCQ_CFG] }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('selecting a template sets templateId and seeds the eval toggles from sections.assessment', async () => {
    const onChange = vi.fn();
    renderStep(onChange);
    const user = userEvent.setup();
    const select = await screen.findByLabelText(/Start from a template/i);
    // The template list loads async (React Query); wait for the real option to render before
    // selecting it — otherwise selectOptions races the fetch and only sees "No template".
    await screen.findByRole('option', { name: 'Data Analyst' });
    await user.selectOptions(select, 'tpl-1');
    // onChange fired with templateId + an evaluation array matching the template's assessment
    const call = onChange.mock.calls.find((c) => c[0].templateId === 'tpl-1');
    expect(call).toBeTruthy();
    const evalPatch = call![0].evaluation as { key: string; enabled: boolean }[];
    const byKey = Object.fromEntries(evalPatch.map((e) => [e.key, e.enabled]));
    expect(byKey).toEqual({ mcq: true, coding: false, tara: true, assignments: true });
  });

  it('selecting a stage EvalConfig sets that stage.evalConfigId', async () => {
    const onChange = vi.fn();
    renderStep(onChange);
    const select = await screen.findByLabelText(/MCQ configuration/i);
    await screen.findByRole('option', { name: 'Standard MCQ' }); // wait for async eval-configs fetch
    await userEvent.selectOptions(select, 'cfg-1');
    const call = onChange.mock.calls.find((c) => Array.isArray(c[0].evaluation)
      && c[0].evaluation.find((s: { key: string; evalConfigId?: string }) => s.key === 'mcq')?.evalConfigId === 'cfg-1');
    expect(call).toBeTruthy();
  });
});
