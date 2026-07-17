# App-wide toast / error-surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A framework-light toast system fed by a global React Query `MutationCache` — failed mutations surface as error toasts by default (opt-out per mutation), and meaningful writes confirm with a success toast (opt-in per mutation).

**Architecture:** A module-level toast store (no React dep on the push side) + a `<Toaster>` rendered once at the app root, reusing the prototype's existing `.toast` CSS. `main.tsx`'s QueryClient gets a `MutationCache` whose `onError` toasts by default (skipping `meta.silentError`) and whose `onSuccess` toasts only when `meta.successMessage` is set. Per-mutation `meta` is applied across the hooks per the audited table below.

**Tech Stack:** React 18 + Vite + @tanstack/react-query 5 (client); vitest + @testing-library/react (tests). Client-only; no server/DB changes.

## Global Constraints

- TS strict; ESM with explicit `.js` import suffixes; `npx -w client tsc --noEmit` must stay clean.
- No `Math.random`/`Date.now`/argless `new Date()` for toast ids — use a module-scoped incrementing counter (keeps tests deterministic).
- Reuse the prototype's existing `.toast` styling in `theme.css`; only ADD variant classes + a stacking wrapper. No new visual language.
- Errors are loud by DEFAULT for every mutation; opt-out via `meta.silentError`. Successes are quiet by DEFAULT; opt-in via `meta.successMessage`.
- Client test conventions: `render` from `@testing-library/react`; `QueryClientProvider` + `AuthProvider` where needed; `vi.stubGlobal('fetch', …)` for network; `vi.useFakeTimers()` for auto-dismiss. There is NO `vi.mock` usage in this repo — follow the fetch-stub convention.
- Commit messages end with exactly:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Work exclusively in the worktree `/Users/srinivasarao.kandula/code/matchday-toasts`. Client-only — no seed, no server.

## The meta audit (source of truth for Task 3)

Each hook defines several `useMutation`s; `meta` is per-mutation. Modals that already show inline errors invoke only their *save* mutations — silence those; leave bulk/list/toggle mutations loud.

| Hook | Mutations | Inline-error modal? | `silentError` on | Everything else |
|---|---|---|---|---|
| `useSlotMutations` | create, update, remove | SlotModal + SlotActionModal (both inline), no FnF consumer | **all** (create, update, remove) | — |
| `useSlotBookings` | book, confirm, release | SlotRosterModal (inline) | **all** | — |
| `useRegistrationAction` | (2 — read the file) | ActionModal + ApprovalDetail (inline) | **all** | — |
| `useEmployerMutations` | create, update, bulk | EmployerModal (inline) | create, update | bulk → loud |
| `useInstituteMutations` | create, update, bulk | InstituteModal (inline) | create, update | bulk → loud |
| `useJobseekerMutations` | add, update, block | JobseekerModal (inline) | add, update | block → loud |
| `useDriveMutations` | create, update, clone, bulk | DriveWizard (inline) | create, update | clone, bulk → loud |
| `useTemplateMutations` | create, update, clone, restore, remove | TemplateEditorModal (NO inline) | none | all → loud |
| `useStreamMutations` | create, update, restore | StreamEditorModal (NO inline) | none | all → loud |
| `useEvalConfigMutations` | create, update, duplicate, remove | EvalConfigModal (NO inline); list toggle uses `update` | none | all → loud |
| `useStreamRulesMutation` | (read the file) | StreamRulesPage (verify — memory says no inline) | none unless inline found | loud |
| `useDriveAssignmentMutations` | assign, unassign, bulkAssign | Institute detail (verify AssignDrivesModal inline) | none unless inline found | loud |

**Implementer MUST verify** each modal's inline behavior and each hook's mutation names before applying (read `useRegistrationAction`/`useStreamRulesMutation`/`useDriveAssignmentMutations`, and confirm `JobseekerModal`/import hooks don't share `add`/`update`). If a modal listed "NO inline" actually shows inline, or an "inline" modal's save mutation is also used fire-and-forget, note it and choose per §"dual-use" — default: silence the mutation the inline modal uses; keep list/bulk loud.

`successMessage` (opt-in) — concrete copy in Task 3, on the meaningful writes (create/update/clone/restore/remove/bulk/assign/book/confirm/release/rules-save).

---

### Task 1: Toast store + `<Toaster>` + CSS + app-root mount (+ tests)

**Files:**
- Create: `client/src/toast/toastStore.ts`, `client/src/toast/Toaster.tsx`
- Modify: `client/src/App.tsx` (mount), `client/src/styles/theme.css` (variants + wrapper)
- Test: `client/src/test/toastStore.test.ts`, `client/src/test/Toaster.test.tsx`

**Interfaces:**
- Produces: `toast.error/success/info(message, title?)`, `subscribe`, `dismiss`, `getToasts` from the store; `<Toaster/>`, `useToast()`.

- [ ] **Step 1: Write the store**

`client/src/toast/toastStore.ts`:
```ts
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
```

- [ ] **Step 2: Write the failing store test**

`client/src/test/toastStore.test.ts`:
```ts
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
```

- [ ] **Step 3: Run — FAIL, then implement passes.** `npm test -w client -- toastStore` (RED first if written before the store; then GREEN).

- [ ] **Step 4: Write `<Toaster>`**

`client/src/toast/Toaster.tsx`:
```tsx
import { useSyncExternalStore } from 'react';
import { dismiss, getToasts, subscribe, toast, type ToastVariant } from './toastStore.js';

const ICON: Record<ToastVariant, string> = { error: 'ti-alert-circle', success: 'ti-circle-check', info: 'ti-info-circle' };
const DEFAULT_TITLE: Record<ToastVariant, string> = { error: 'Something went wrong', success: 'Done', info: 'Notice' };

export function Toaster() {
  const toasts = useSyncExternalStore(subscribe, getToasts, getToasts);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast show toast-${t.variant}`}>
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
```

- [ ] **Step 5: CSS variants + wrapper** — in `client/src/styles/theme.css`, add after the existing `.toast` rules:
```css
  .toast-wrap{position:fixed;top:70px;right:20px;z-index:120;display:flex;flex-direction:column;gap:10px;align-items:flex-end}
  .toast-wrap .toast{position:static;transform:none}          /* stack inside the wrap; base .toast was fixed+slid */
  .toast.toast-error{border-left-color:var(--danger)} .toast.toast-error i{color:var(--danger)}
  .toast.toast-info{border-left-color:var(--muted)} .toast.toast-info i{color:var(--muted)}
```
(The base `.toast` is green/success by default — that covers the `success` variant. Confirm `--danger`/`--muted` exist in theme.css; if named differently, use the real vars.)

- [ ] **Step 6: Failing Toaster test** — `client/src/test/Toaster.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Toaster } from '../toast/Toaster.js';
import { dismiss, getToasts, toast } from '../toast/toastStore.js';

beforeEach(() => getToasts().slice().forEach((t) => dismiss(t.id)));
afterEach(() => getToasts().slice().forEach((t) => dismiss(t.id)));

describe('Toaster', () => {
  it('renders an error toast with its message + variant class', () => {
    toast.error('save failed');
    render(<Toaster />);
    expect(screen.getByText('save failed')).toBeTruthy();
    expect(document.querySelector('.toast-error')).toBeTruthy();
  });
  it('dismiss button removes the toast', async () => {
    toast.info('hello'); render(<Toaster />);
    await userEvent.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByText('hello')).toBeNull();
  });
});
```
Run `npm test -w client -- Toaster` → GREEN after Steps 4-5.

- [ ] **Step 7: Mount at root** — in `client/src/App.tsx`, import `{ Toaster }` and render it inside `<AuthProvider>` as a sibling of `<Routes>`:
```tsx
    <AuthProvider>
      <Toaster />
      <Routes>
        …
      </Routes>
    </AuthProvider>
```

- [ ] **Step 8: tsc + full client suite + commit** — `npx -w client tsc --noEmit`; `npm test -w client`; commit.
```bash
git add client/src/toast/ client/src/App.tsx client/src/styles/theme.css client/src/test/toastStore.test.ts client/src/test/Toaster.test.tsx
git commit -m "feat(client): toast store + Toaster mounted at app root

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Global `MutationCache` wiring + meta typing (+ integration tests)

**Files:**
- Create: `client/src/toast/mutationMeta.d.ts` (augment react-query meta types)
- Modify: `client/src/main.tsx`
- Test: `client/src/test/mutationToasts.test.tsx`

**Interfaces:**
- Consumes: the Task 1 store (`toast`), `ApiError`.
- Produces: every mutation error toasts unless `meta.silentError`; every mutation success toasts when `meta.successMessage` is set.

- [ ] **Step 1: Type augmentation** — `client/src/toast/mutationMeta.d.ts`:
```ts
import '@tanstack/react-query';
declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { silentError?: boolean; successMessage?: string };
  }
}
```
(This types `mutation.meta` as `{ silentError?: boolean; successMessage?: string }` — no casts needed. Ensure the file is included by tsconfig's `include`.)

- [ ] **Step 2: Wire the cache** — in `client/src/main.tsx`:
```ts
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from './api/client.js';
import { toast } from './toast/toastStore.js';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      if (mutation.meta?.silentError) return;
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    },
    onSuccess: (_data, _vars, _ctx, mutation) => {
      const msg = mutation.meta?.successMessage;
      if (msg) toast.success(msg);
    },
  }),
});
```
(Keep the existing `QueryClientProvider`/`BrowserRouter`/`App` render.)

- [ ] **Step 3: Failing integration test** — `client/src/test/mutationToasts.test.tsx`. Build a QueryClient with the SAME MutationCache config (import/replicate it), render a tiny component that fires mutations with different meta, plus `<Toaster/>`, and assert toasts. Use a fetch stub or a mutationFn that resolves/rejects directly:
```tsx
// helper: renders <QueryClientProvider client={qc}><Toaster/><Trigger/></QueryClientProvider>
// where Trigger uses useMutation with a given meta + a mutationFn that rejects with new ApiError(400,'nope','x') or resolves.
it('a failing mutation shows an error toast with the message', async () => { /* fire reject → findByText('nope') */ });
it('meta.silentError suppresses the error toast', async () => { /* fire reject with meta {silentError:true} → queryByText stays null */ });
it('meta.successMessage shows a success toast on success', async () => { /* fire resolve with meta {successMessage:'Saved'} → findByText('Saved') */ });
```
To avoid divergence, EXPORT the mutationCache config from a small factory (e.g. `client/src/toast/mutationCache.ts` exporting `makeMutationCache()`), use it in both `main.tsx` and the test. (Optional but recommended — otherwise replicate the 10 lines in the test.)

- [ ] **Step 4: RED → GREEN** — `npm test -w client -- mutationToasts`. Implement until green; `npx -w client tsc --noEmit` clean.

- [ ] **Step 5: Full client suite + commit** — `npm test -w client`; commit.
```bash
git add client/src/main.tsx client/src/toast/mutationMeta.d.ts client/src/toast/mutationCache.ts client/src/test/mutationToasts.test.tsx
git commit -m "feat(client): global mutation error/success toasts via MutationCache

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Apply `meta` across the mutation hooks (silentError + successMessage)

**Files:** the 12 hook files under `client/src/pages/**/hooks/` (see the audit table). Test: none new required (the mechanism is covered by Task 2; the full suite is the regression net) — but add ONE spot-check if convenient.

**Interfaces:** consumes the Task 2 wiring. No behavior change beyond which toasts fire.

- [ ] **Step 1: Verify the audit** — read `useRegistrationAction`, `useStreamRulesMutation`, `useDriveAssignmentMutations`, and re-confirm which modals show inline errors (grep `setError|ApiError|catch|onError` in each modal). Confirm `useJobseekerMutations`' `add`/`update` are only used by `JobseekerModal` (not the import hooks). Adjust the table below if reality differs; note any deviation.

- [ ] **Step 2: Add `silentError`** to these mutations (set `meta: { silentError: true }` in their `useMutation({ … })` options — alongside the existing `onSuccess: invalidate`):
  - `useSlotMutations`: create, update, remove
  - `useSlotBookings`: book, confirm, release
  - `useRegistrationAction`: both mutations
  - `useEmployerMutations`: create, update  (NOT bulk)
  - `useInstituteMutations`: create, update  (NOT bulk)
  - `useJobseekerMutations`: add, update  (NOT block)
  - `useDriveMutations`: create, update  (NOT clone, NOT bulk)

- [ ] **Step 3: Add `successMessage`** to the meaningful writes (merge into the same `meta` object; a mutation can carry both `silentError` and `successMessage`). Suggested copy (adjust wording to match app tone):
  - Drives: create/update → `'Drive saved'`; clone → `'Drive cloned'`; bulk → `'Drives updated'`
  - Employers: create/update → `'Employer saved'`; bulk → `'Employers updated'`
  - Institutes: create/update → `'Institute saved'`; bulk → `'Institutes updated'`
  - Jobseekers: add → `'Jobseeker added'`; update → `'Jobseeker saved'`; block → `'Jobseekers blocked'`
  - Templates: create → `'Template created'`; update → `'Template saved'`; clone → `'Template cloned'`; restore → `'Version restored'`; remove → `'Template deleted'`
  - Streams: create → `'Stream created'`; update → `'Stream saved'`; restore → `'Version restored'`
  - EvalConfigs: create → `'Configuration created'`; update → `'Configuration saved'`; duplicate → `'Configuration duplicated'`; remove → `'Configuration deleted'`
  - StreamRules save → `'Selection rules saved'`
  - DriveAssignment: assign/bulkAssign → `'Drives assigned'`; unassign → `'Drive unassigned'`
  - Slots: create → `'Slot created'`; update → `'Slot updated'`; remove → `'Slot deleted'`
  - Bookings: book → `'Candidate booked'`; confirm → `'Booking confirmed'`; release → `'Booking released'`

- [ ] **Step 4: tsc + full client suite** — `npx -w client tsc --noEmit`; `npm test -w client`. Existing tests must stay green; the meta additions don't change mutation behavior (only which toasts fire), and no test asserts the absence of a global toast. If a client test now renders a `<Toaster>`-less tree and a mutation error toast is attempted, it's a no-op (the store push is harmless without a Toaster mounted) — confirm no test breaks.

- [ ] **Step 5: Commit**
```bash
git add client/src/pages
git commit -m "feat(client): wire per-mutation error/success toast meta across hooks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Full-suite verification + build

**Files:** none (verification only).

- [ ] **Step 1:** `npm test -w client` (full suite green).
- [ ] **Step 2:** `npx -w client tsc --noEmit` clean; `npm run -w client build` succeeds.
- [ ] **Step 3:** (server untouched, but confirm no cross-effect) `npx -w server tsc --noEmit` clean; `npm test -w server` green.
- [ ] **Step 4:** No commit.

---

## Self-Review Notes (author)

- **Spec coverage:** store + Toaster + CSS + mount → T1; global MutationCache wiring + meta typing → T2; per-mutation meta (the §3.6/§3.7 audit) → T3; verify → T4.
- **Dual-use resolved WITHOUT modal surgery:** because `meta` is per-`useMutation` and each hook has multiple, silence only the save mutations the inline modals invoke (create/update/add/book/etc.); leave bulk/clone/toggle/remove loud. The inline modals keep their error UI; their list/bulk siblings get the toast. No double-report, no lost coverage.
- **Errors default-on / success opt-in** keeps the app from toasting on every toggle: only mutations with `meta.successMessage` confirm.
- **No React dep on push side** → the QueryClient (created outside React) pushes via the module store; `<Toaster>` bridges to the DOM.
- **Determinism:** toast ids from an incrementing counter, not `Math.random`/`Date.now`.
- **Type consistency:** `mutationMeta` augmentation types `meta.silentError`/`meta.successMessage` everywhere — the hooks set them, the cache reads them, no casts.
- **Test-safety:** pushing to the store without a mounted `<Toaster>` is a harmless no-op, so existing page tests (which don't mount Toaster) don't break when their mutations error.
