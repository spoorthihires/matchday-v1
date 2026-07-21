# Employer Portal — Slice 12: Support

**Date:** 2026-07-21
**Status:** Approved (scope self-decided under the user's "complete both remaining slices" mandate while away; decisions documented below)
**Builds on:** 1 (shell/topbar, `/employer` gate), 3 (`RegistrationRequest`, `codeFor`-style derived refs). **Stacked** on `feat/employer-portal-slice11` (worktree `~/code/matchday-employer12`).
**Prototype:** `Matchday_Employer.html` — Screen 25 "Support center" (`#page-support` ~3322; support modal ~3576; `SUPPORT_ACTIONS`/`supportTickets`/`renderSupport`/`submitSupport` ~7508–7615; topbar Help icon ~2685) + the marketing FAQ accordion (`FAQS`/`buildFaqs` ~3715). CSS already ported: `.faq`/`.faq summary`/`.q-ic`/`.faq .a` (328-337), `.sup-card`/`.sc-*`, `.ticket-row`/`.ticket-*`, `.sup-form-grid`/`.sup-field` (~1869-1889).

## Scope note (decomposition)
Third of the decomposed original "Slice 10" bundle (Reports=10/#35, Notifications=11/#36). This is **Support**; **Team-access/RBAC** is the last slice (13).

## Summary
A **self-contained support surface**: a static **FAQ** accordion + a **"raise a request"** form that persists a real, employer-scoped `SupportRequest`, and a **"My requests"** list of the employer's own submitted requests with a derived reference and status. Honest and in-app only — the request is a genuine stored record (not a faked stat), surfaced back to the employer; there is no email/notification delivery.

**Decisions locked (self-decided):**
1. **A real stored `SupportRequest` entity** (not a client-only mock) — creating a support request is legitimate user-authored data, so it is stored and listed back. This is the one honest piece of persistence; nothing here is a fabricated/derived stat.
2. **Employer-facing create + list only** — no admin console UI for tickets this slice (the record is stored for the Hiringhood team to action out-of-band; a future admin queue can read it).
3. **Derived reference** — the ticket ref (`SUP-<last6>`) is derived from `_id`, never a stored counter (matches the derived-never-stored ethos; mirrors 5a's `codeFor`).
4. **FAQ authored to match the real feature set** (registration, candidates, consent/reveal, slots, interviews, offers) rather than porting the prototype's marketing copy — the FAQ describes what the portal actually does.
5. **Entry = a topbar Help icon** (ports the prototype's topbar Help button) → `/employer/support`.

## Non-goals (deliberate)
- No email / notification / ticket-status-change delivery (in-app; the record is actioned out-of-band). A created support request does NOT create a Slice-11 notification (notifications are for events triggered by *others*; this is the employer's own action).
- No admin-side ticket management UI (the model is admin-readable for a future slice).
- No file attachments; no per-category dynamic form fields (the prototype's 8 action-specific field sets) — a single simple form (category + subject + message + priority).
- No PII concerns (the employer submits about their own hiring; no jobseeker identity is required or emitted).

## Architecture

### Model (new)
`server/src/models/SupportRequest.ts`:
```
{
  employerId: ObjectId ref Employer (required, indexed),
  category: enum ['More candidates','Slot change','Candidate replacement','No-show','Profile/data issue','Resume access','Commercial/billing','Other'] (required),
  subject: String (required),
  message: String (required),
  priority: enum ['Low','Normal','High'] (default 'Normal'),
  status: enum ['Open','In progress','Resolved'] (default 'Open'),
  createdAt: Date (default Date.now),
}
```
No `timestamps` needed (manual `createdAt`, matching Slot/SlotBooking convention).

### Server — 2 endpoints (on the existing `/employer` gate), in a focused module
New `server/src/modules/employerPortal/employerSupport.{service,controller,schemas}.ts`.
- **`POST /api/me/employer/support`** — body `{ category, subject, message, priority? }` (zod: category ∈ enum, subject/message non-empty trimmed, priority ∈ enum default 'Normal'; the schema does NOT accept `employerId`/`status`). `employerId` server-set from `req.userId`; `status` always defaults 'Open'. Returns the created request projected with a **derived `ref`** (`SUP-<last6 of _id, upper>`), category, subject, message, priority, status, `createdAt` (ISO).
- **`GET /api/me/employer/support`** — the employer's own requests (`{employerId}`), newest-first, same projection. Employer-scoped (never another employer's).
- Error envelope `{ error:{message,code} }`; ESM `.js` specifiers.

### Cross-slice notes
Greenfield model; reads/writes only `SupportRequest`, scoped by `employerId` from the JWT. Touches no other slice's data. Admin modules untouched.

## Client — page, hook, topbar Help, route
- **Types** (`client/src/types/employer.ts`): `SupportRequestItem` (`{ id, ref, category, subject, message, priority, status, createdAt }`), `SUPPORT_CATEGORIES` list (for the select).
- **Hooks** (`hooks/useEmployerSupport.ts`): `useEmployerSupport()` (list, key `['employer-support']`) + `useCreateSupportRequest()` (POST; invalidates `['employer-support']`). Reuse `formatRelativeTime` from `useEmployerNotifications.ts`.
- **`EmployerSupport`** (`/employer/support`, in `EmployerShell`, `.page-wrap`): a **FAQ** section (authored Q&A rendered as `<details className="faq">` accordions, ported CSS); a **"Raise a request"** card (category `<select>`, subject input, message textarea, priority `<select>`, submit → create mutation, success/error surfaced); a **"My requests"** card listing `.ticket-row`s (derived `ref`, category+subject title, message summary, `.status-pill`/`st-*` status, relative time) with an empty state.
- **Topbar Help icon** (`EmployerShell.tsx`): an `.icon-btn` with `aria-label="Help"` in `.tb-actions` (next to the bell), click → `navigate('/employer/support')` (ports the prototype's Help button).
- **Route** (`App.tsx`): `/employer/support` wrapped `RoleRoute role="employer" > EmployerShell > EmployerSupport`.

## Error handling
`{ error:{message,code} }`. zod validation (bad category/priority, empty subject/message) → 400 `validation`. Role guards → 401/403. `GET`/`POST` take no path params (the employer's own scope), so no 404 surface.

## Testing
### Server (`employer-support.route.test.ts`)
- `POST` creates a request: `employerId` server-set (a spoofed `employerId`/`status` in the body is ignored), `status:'Open'`, derived `ref` = `SUP-` + the id's last 6 upper; bad category/priority or empty subject → 400.
- `GET` lists only the caller's own requests, newest-first; a second employer's requests are excluded.
- `401` no token / `403` admin token.

### Client (`EmployerSupport.test.tsx`)
- Renders the FAQ accordions + the request form + an existing request row (from a mocked list); submitting the form fires `POST /me/employer/support` with the chosen category/subject/message; the FAQ `<details>` are present; empty "My requests" state when the list is empty.

## Verification
Full server + client suites green, both `tsc --noEmit` clean, client build ok. Live E2E on an isolated DB (`matchday_employer12_smoke`, dropped after; shared untouched): create a support request (employerId server-set, status Open, derived ref), list it back, a spoofed employerId body ignored, a second employer's requests excluded, admin → 403; shared `matchday` untouched.

## Follow-ups / known stubs
- No admin ticket-management UI (model is admin-readable for a future slice); no status-change flow for the employer (status is server-owned).
- No email/notification on create or status change; no attachments; single generic form (no per-category fields).
- Team-access (RBAC) remains as the final slice (13).
