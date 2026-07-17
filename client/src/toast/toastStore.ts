export type ToastVariant = 'error' | 'success' | 'info';
export interface Toast { id: string; variant: ToastVariant; title?: string; message: string }

const DURATION: Record<ToastVariant, number> = { error: 7000, success: 4000, info: 4000 };
let seq = 0;
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() { for (const l of listeners) l(); }

export function subscribe(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
export function getToasts(): Toast[] { return toasts; }

export function dismiss(id: string): void {
  toasts = toasts.filter((t) => t.id !== id);
  const timer = timers.get(id);
  if (timer) { clearTimeout(timer); timers.delete(id); }
  emit();
}

export function push(input: { variant: ToastVariant; title?: string; message: string }): string {
  const id = `t${++seq}`;
  toasts = [...toasts, { id, ...input }];
  emit();
  timers.set(id, setTimeout(() => dismiss(id), DURATION[input.variant]));
  return id;
}

export const toast = {
  error: (message: string, title?: string) => push({ variant: 'error', message, title }),
  success: (message: string, title?: string) => push({ variant: 'success', message, title }),
  info: (message: string, title?: string) => push({ variant: 'info', message, title }),
};
