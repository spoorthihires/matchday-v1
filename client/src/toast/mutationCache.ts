import { MutationCache } from '@tanstack/react-query';
import { ApiError } from '../api/client.js';
import { toast } from './toastStore.js';

export function makeMutationCache(): MutationCache {
  return new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      if (mutation.meta?.silentError) return;
      if (err instanceof ApiError && err.status === 401) return;
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    },
    onSuccess: (_data, _vars, _ctx, mutation) => {
      const msg = mutation.meta?.successMessage;
      if (msg) toast.success(msg);
    },
  });
}
