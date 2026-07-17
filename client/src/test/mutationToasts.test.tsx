import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api/client.js';
import { makeMutationCache } from '../toast/mutationCache.js';
import { Toaster } from '../toast/Toaster.js';
import { dismiss, getToasts } from '../toast/toastStore.js';

interface TriggerProps {
  meta?: { silentError?: boolean; successMessage?: string };
  shouldFail?: boolean;
}

function Trigger({ meta, shouldFail }: TriggerProps) {
  const mutation = useMutation({
    mutationFn: async () => {
      if (shouldFail) throw new ApiError(400, 'nope', 'x');
      return 'ok';
    },
    meta,
  });
  return (
    <button onClick={() => mutation.mutate()}>fire</button>
  );
}

function renderTrigger(props: TriggerProps) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    mutationCache: makeMutationCache(),
  });
  return render(
    <QueryClientProvider client={qc}>
      <Toaster />
      <Trigger {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => getToasts().slice().forEach((t) => dismiss(t.id)));
afterEach(() => getToasts().slice().forEach((t) => dismiss(t.id)));

describe('mutation toasts (global MutationCache)', () => {
  it('a failing mutation shows an error toast with the message', async () => {
    renderTrigger({ shouldFail: true });
    await userEvent.click(screen.getByText('fire'));
    expect(await screen.findByText('nope')).toBeTruthy();
  });

  it('meta.silentError suppresses the error toast', async () => {
    renderTrigger({ shouldFail: true, meta: { silentError: true } });
    await userEvent.click(screen.getByText('fire'));
    // Give the mutation a tick to settle, then assert no toast ever appears.
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText('nope')).toBeNull();
  });

  it('meta.successMessage shows a success toast on success', async () => {
    renderTrigger({ shouldFail: false, meta: { successMessage: 'Saved' } });
    await userEvent.click(screen.getByText('fire'));
    expect(await screen.findByText('Saved')).toBeTruthy();
  });
});
