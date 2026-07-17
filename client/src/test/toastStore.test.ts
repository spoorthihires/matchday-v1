import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dismiss, getToasts, push, subscribe, toast } from '../toast/toastStore.js';

beforeEach(() => { vi.useFakeTimers(); getToasts().slice().forEach((t) => dismiss(t.id)); });
afterEach(() => { vi.useRealTimers(); });

describe('toastStore', () => {
  it('push appends and returns an id; subscribe fires', () => {
    const seen: number[] = []; const un = subscribe(() => seen.push(getToasts().length));
    const id = toast.error('boom');
    expect(getToasts().at(-1)).toMatchObject({ id, variant: 'error', message: 'boom' });
    expect(seen.length).toBeGreaterThan(0); un();
  });
  it('auto-dismisses after the variant duration', () => {
    toast.success('ok'); expect(getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(4000); expect(getToasts()).toHaveLength(0);
  });
  it('dismiss removes immediately', () => {
    const id = toast.info('hi'); dismiss(id); expect(getToasts()).toHaveLength(0);
  });
});
