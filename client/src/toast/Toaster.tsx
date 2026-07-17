import { useSyncExternalStore } from 'react';
import { dismiss, getToasts, subscribe, toast, type ToastVariant } from './toastStore.js';

const ICON: Record<ToastVariant, string> = { error: 'ti-alert-circle', success: 'ti-circle-check', info: 'ti-info-circle' };
const DEFAULT_TITLE: Record<ToastVariant, string> = { error: 'Something went wrong', success: 'Done', info: 'Notice' };

export function Toaster() {
  const toasts = useSyncExternalStore(subscribe, getToasts, getToasts);
  return (
    <div className="toast-wrap" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast show toast-${t.variant}`} role={t.variant === 'error' ? 'alert' : 'status'}>
          <i className={`ti ${ICON[t.variant]}`} />
          <div style={{ flex: 1 }}>
            <div className="t-title">{t.title ?? DEFAULT_TITLE[t.variant]}</div>
            <div className="t-body">{t.message}</div>
          </div>
          <button className="x" aria-label="Dismiss" onClick={() => dismiss(t.id)}><i className="ti ti-x" /></button>
        </div>
      ))}
    </div>
  );
}

export function useToast() { return toast; }
