# App-wide toast / error-surface — MERN Slice Design

**Date:** 2026-07-17
**Status:** Approved design, pending implementation plan
**Depends on:** the completed port + real-links phase — all on `origin/main` @5f7fcaf. Client-only; independent of the open server-side tech-debt PR #11.
**Context:** Tech-debt burndown item. Most React Query mutations in the admin client are fire-and-forget — when a create/update/delete/booking/bulk action fails (server 400/500), the `ApiError` is swallowed and nothing tells the admin. A handful of modals (SlotModal, SlotActionModal, SlotRosterModal, the EvalConfig modals, the registration-approval flow) already show errors inline near the form; everything else is silent. This slice adds a consistent app-wide toast system: failed mutations surface as error toasts by default, and meaningful writes confirm with a success toast.

## 1. Goal & Scope

A small, framework-light toast system, fed automatically by a global React Query `MutationCache`, so mutation failures are never silent and key successes are confirmed.

### In scope
- **Toast store** (`client/src/toast/toastStore.ts`) — module-level, no React dependency on the push side, so the non-React QueryClient can push directly.
- **`<Toaster>`** (`client/src/toast/Toaster.tsx`) — renders the active stack using the prototype's existing `.toast` CSS, plus `err`/`ok`/`info` variant classes; mounted once at the app root.
- **Global `MutationCache`** in `main.tsx`: `onError` → error toast **by default** (opt-out via `meta.silentError`); `onSuccess` → success toast **only** when the mutation declares `meta.successMessage` (opt-in).
- **Per-mutation `meta`** wiring: `silentError` on the hooks already showing inline errors; `successMessage` on the primary write actions.
- **CSS variants** appended to `theme.css` for the error/info toast colors.

### Out of scope (deferred)
- **Query (load) errors** — pages already render inline "Failed to load" states; not routed to toasts.
- **Push/websocket notifications** — the Topbar bell stays static.
- **Per-field form validation** — stays inline in the forms.
- **Success toasts on trivial writes** (inline enable-toggles, filters, re-sorts) — intentionally quiet (they simply don't set `meta.successMessage`).

## 2. Confirmed Decisions

| Decision | Choice |
|---|---|
| What surfaces | Errors (auto, default-on) **and** success confirmations (opt-in per mutation) |
| Coexistence with inline errors | Global toast + per-mutation **opt-out** (`meta.silentError`); inline-error modals keep near-field feedback |
| Errors | Loud by default for every mutation; opt-out via `meta.silentError` |
| Successes | Quiet by default; opt-in via `meta.successMessage` (keeps toggles/filters silent) |
| Store | Framework-light module store (push side has no React dependency) |
| Mount | Once at the app root (`App.tsx`, sibling of `<Routes>`) |

## 3. Client changes

### 3.1 Toast store — `client/src/toast/toastStore.ts`
```
type ToastVariant = 'error' | 'success' | 'info';
interface Toast { id: string; variant: ToastVariant; title?: string; message: string }
```
- Internal `Toast[]` + a `Set<listener>`; `subscribe(fn)` returns an unsubscribe.
- `push({ variant, title, message })` → assigns an id, appends, schedules auto-dismiss (success/info ~4s, error ~7s), notifies listeners; returns the id.
- `dismiss(id)` removes + notifies.
- Convenience exports: `toast.error(message, title?)`, `toast.success(message, title?)`, `toast.info(message, title?)`.
- Id generation must NOT use `Math.random`/`Date.now` in a way that breaks tests — use a module-scoped incrementing counter.

### 3.2 `<Toaster>` — `client/src/toast/Toaster.tsx`
- `useSyncExternalStore` (or `useState`+`useEffect` subscribe) to read the store's toast list.
- Renders a container of `.toast .toast.show .toast-<variant>` elements: an icon (`ti-alert-circle` error / `ti-circle-check` success / `ti-info-circle` info), a `.t-title` (variant default title if none given: "Something went wrong" / "Done" / "Notice"), a `.t-body` (message), and a close button (`×`) calling `dismiss(id)`.
- `role="status"` / `aria-live="polite"` container for a11y.
- `useToast()` hook exported for imperative in-component pushes (returns `{ error, success, info }` bound to the store) — convenience; the global wiring covers most cases.

### 3.3 CSS — `client/src/styles/theme.css`
The base `.toast` (fixed top-right, slide-in, green/success left-border) already exists. Append:
- `.toast.toast-error { border-left-color: var(--danger) } .toast.toast-error i { color: var(--danger) }`
- `.toast.toast-info { border-left-color: var(--muted) } .toast.toast-info i { color: var(--muted) }`
- Stack multiple toasts (the container gaps them; base `.toast` is `position:fixed` top:70px — the container will offset each, e.g. via fl[ex column in a fixed wrapper, or incremental `top`). Keep it simple: a fixed `.toast-wrap` column at top-right holding the toasts; adjust `.toast` to `position:static`/relative inside the wrap, or keep fixed and stack with translateY. (Exact mechanism decided in the plan; visually a top-right stack.)

### 3.4 Global wiring — `client/src/main.tsx`
```
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
      const m = mutation.meta?.successMessage;
      if (typeof m === 'string' && m) toast.success(m);
    },
  }),
});
```
(TypeScript: `mutation.meta` is `Record<string, unknown> | undefined`; read `meta?.silentError`/`meta?.successMessage` with a cast or a typed `Register` augmentation. A small module augmentation of react-query's `Register['mutationMeta']` can type `silentError?: boolean; successMessage?: string` — decided in the plan.)

### 3.5 `<Toaster>` mount — `client/src/App.tsx`
Render `<Toaster />` inside `<AuthProvider>`, as a sibling of `<Routes>`, so it is global across every route/shell.

### 3.6 Per-mutation `meta`
- **`meta: { silentError: true }`** on the mutations whose modals already show inline errors — so they don't double-report:
  - `useSlotMutations` (create/update/remove — used by SlotModal + SlotActionModal, both inline).
  - `useBookingMutations` (book/confirm/release — SlotRosterModal, inline).
  - `useEvalConfigMutations` (used by the EvalConfig modal, inline) — **but see the dual-use audit below.**
  - `useRegistrationAction` (approvals ActionModal, inline).
- **`meta: { successMessage: '…' }`** on the primary write actions (concrete copy set in the plan), e.g. drive/template/stream/eval-config/employer/institute create·update·delete·clone, assign-drives, slot book/confirm/release, bulk actions, approval accept/reject. Trivial writes (inline enable-toggles, filter/sort) get **no** `successMessage` (stay quiet).

### 3.7 Dual-use hook audit (resolved in the plan)
`meta` is set per-hook, so a hook used by *both* an inline-error modal *and* a fire-and-forget caller (e.g. an EvalConfig edited in a modal vs. an inline enable-toggle on the list) can't be blanket-silenced without also silencing the fire-and-forget path. The plan will enumerate each mutation hook's call-sites and, for any dual-use hook, choose per-case: keep the global toast and drop the now-redundant inline error for that hook, or split into two mutation definitions. No hook is silenced blindly.

## 4. Testing (TDD)

- **`toastStore`** (pure unit): `push` appends + returns id; `dismiss` removes; auto-dismiss fires after the timer (fake timers); `subscribe` notifies + unsubscribes; `toast.error/success/info` set the right variant.
- **`Toaster`** (component): renders one toast per store entry with the right variant class + icon + message; the close button dismisses; empty store renders nothing.
- **Global wiring** (integration): build a `QueryClient` with the real `MutationCache` config + a `<Toaster>`; a component fires (a) a mutation that rejects with an `ApiError` → an error toast with the message appears; (b) a mutation with `meta.silentError` that rejects → **no** toast; (c) a mutation with `meta.successMessage` that resolves → a success toast appears.
- Match the client test conventions (QueryClientProvider + fetch stub; `vi.useFakeTimers` for auto-dismiss).

## 5. File Structure

```
client/src/
  toast/toastStore.ts          # NEW — store + toast.error/success/info
  toast/Toaster.tsx            # NEW — renders the stack + useToast() hook
  main.tsx                     # + MutationCache(onError/onSuccess)
  App.tsx                      # + <Toaster/> at root
  styles/theme.css             # + .toast-error / .toast-info variants (+ stack wrap)
  types/reactQuery.d.ts        # NEW (optional) — augment mutationMeta types
  pages/**/hooks/*Mutations.ts # + meta.silentError / meta.successMessage (per §3.6, audited per §3.7)
client/src/test/
  toastStore.test.ts           # NEW
  Toaster.test.tsx             # NEW
  mutationToasts.test.tsx      # NEW — global wiring (error/silent/success)
```

## 6. Notes

- **Framework-light store** lets the QueryClient (created outside React in `main.tsx`) push toasts without a hook/context — the cleanest way to bridge the non-React mutation cache to the UI.
- **Errors loud, successes quiet-by-default** — you always want to know a write failed; you only confirm the writes worth confirming. This keeps the app from becoming a toast machine gun on every toggle.
- **No double-reporting** — inline-error modals opt out via `meta.silentError`; the dual-use audit (§3.7) prevents accidentally silencing a fire-and-forget path.
- **Reuses the prototype's `.toast` styling** — only variant colors + a stacking wrapper are added; no new visual language.
- **Isolation/DB:** client-only slice, built in an isolated worktree (`/Users/srinivasarao.kandula/code/matchday-toasts`, off `origin/main`); no server/DB changes, no seed run.
