# Jobseeker Portal — Slice JS-A (Self-Tracking) Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox steps.

**Goal:** Surface & let the seeker act on employer activity: reveal-requests (respond), my-interviews (view), my-offers (view + Accept/Decline).

**Architecture:** New derived read endpoints + one seeker write on the existing `/api/me` seeker gate; three new sections on the single Portal page. Derive-only except the offer-respond and the (already-live) reveal-respond writes. `jobseekerId` always from `req.userId`.

**Tech:** Node/Express + Mongoose (ESM `.js`), Zod; React + React Query; Vitest + Supertest / Testing Library.

## Global Constraints
- Branch `feat/jobseeker-portal-completion` (base commit `3f75b8d`, on `main`). Reuse `codeFor`, consent helpers, `Employer`/`Drive`/`Slot`/`Interview`/`Application`. `passwordHash`/PII never emitted; company names are non-secret to the seeker. Error envelope `{error:{message,code}}`.
- Mirror existing patterns: server tests → `server/test/seeker-portal.route.test.ts` + `seeker-reveal.route.test.ts` (supertest + `signToken({sub,role:'jobseeker'})` + `setupTestDb`/`clearDb`). Client → `client/src/hooks/usePortal.ts` (query) + `client/src/pages/EmployerPortal/hooks/useEmployerCandidates.ts` (mutation `apiFetch(path,{method,body,token})`); client tests → `client/src/test/Portal.test.tsx` harness (ThemeProvider+QueryClient+MemoryRouter+AuthProvider, `localStorage 'matchday.auth'`, `vi.stubGlobal('fetch',…)`).

## Prereq
`cd ~/code/matchday-jsreveal` (deps installed). Baseline: `npm test -w server -- --run test/seeker-portal.route.test.ts` passes.

---

## Task 1: Server — interviews + offers read endpoints + offer-respond

**Files:** Modify `server/src/modules/seekerPortal/seekerPortal.service.ts`, `seekerPortal.controller.ts`, `seekerPortal.routes.ts`, `seekerPortal.schemas.ts`; Create `server/test/seeker-activity.route.test.ts`.

**Interfaces produced:** `listInterviews(jobseekerId)`, `listOffers(jobseekerId)`, `respondOffer(jobseekerId, applicationId, {response, declineReason?})`; routes `GET /portal/interviews`, `GET /portal/offers`, `POST /portal/offers/:applicationId/respond`.

- [ ] **Step 1: Failing test** — Create `server/test/seeker-activity.route.test.ts` (mirror `seeker-reveal.route.test.ts` setup). Seed an Institute, a Jobseeker (with `passwordHash` so a token is valid; stage e.g. 'Shortlisted'), an Employer, a Drive, an Application for (emp,drive,seeker) with an `offer` sub-doc, a Slot (with `link`), and an Interview (emp/drive/seeker/slot). Mint `jsToken = signToken({sub: String(seeker._id), role:'jobseeker'})`. Assert:
  - `GET /api/me/portal/interviews` → 200, one item with `company`=Employer.name, `driveName`=Drive.name, `date` (ISO from slot), `start`/`end`/`time`, `status`, `link`=slot.link, `interviewers`. No other seeker's interviews.
  - `GET /api/me/portal/offers` → items only where `offer.status ∈ {Sent,Accepted,Declined,Joined}` (seed one `Sent` → present; seed a second Application with `offer.status:'Draft'` → ABSENT). Item has `company/driveName/status/response/ctc/location/mode/joinDate/declineReason`. No `passwordHash`/PII of others.
  - `POST /api/me/portal/offers/:applicationId/respond` `{response:'Accepted'}` on the Sent offer → 200 `{response:'Accepted'}`; re-GET shows `response:'Accepted'` and **`status` unchanged** (`Sent`). Respond on the Draft-offer app → `400 offer_not_actionable`. Respond on a foreign application id → `404`. `{response:'Declined', declineReason:'x'}` sets both.
  - `401` no token; `403` admin token; `403` employer token — on all three routes.

- [ ] **Step 2: Run → fails.** `npm test -w server -- --run test/seeker-activity.route.test.ts`

- [ ] **Step 3: Service.** Append to `seekerPortal.service.ts` (add imports for `Interview` from `../../models/Interview.js` if missing; `Employer`/`Drive`/`Slot`/`Application` already imported):

```ts
const OFFER_SENT_STATES = ['Sent', 'Accepted', 'Declined', 'Joined'];

async function nameMaps(employerIds: string[], driveIds: string[]) {
  const [emps, drives] = await Promise.all([
    Employer.find({ _id: { $in: [...new Set(employerIds)] } }).select('name').lean(),
    Drive.find({ _id: { $in: [...new Set(driveIds)] } }).select('name').lean<{ _id: Types.ObjectId; name?: string }[]>(),
  ]);
  return {
    emp: new Map(emps.map((e) => [String(e._id), e.name as string])),
    drive: new Map(drives.map((d) => [String(d._id), d.name ?? '—'])),
  };
}

export async function listInterviews(jobseekerId: string) {
  if (!Types.ObjectId.isValid(jobseekerId)) throw new HttpError(404, 'Jobseeker not found', 'not_found');
  const rows = await Interview.find({ jobseekerId }).lean();
  const slots = await Slot.find({ _id: { $in: [...new Set(rows.map((r) => String(r.slotId)))] } })
    .select('date start end link').lean<{ _id: Types.ObjectId; date: Date; start: string; end: string; link?: string }[]>();
  const slotMap = new Map(slots.map((s) => [String(s._id), s]));
  const { emp, drive } = await nameMaps(rows.map((r) => String(r.employerId)), rows.map((r) => String(r.driveId)));
  const items = rows.map((r) => {
    const s = slotMap.get(String(r.slotId));
    return {
      interviewId: String(r._id),
      company: emp.get(String(r.employerId)) ?? '—',
      driveName: drive.get(String(r.driveId)) ?? '—',
      date: s?.date ? new Date(s.date).toISOString() : null,
      start: s?.start ?? '', end: s?.end ?? '', time: r.time,
      status: r.status, interviewers: r.interviewers ?? [], link: s?.link ?? '',
    };
  });
  items.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.time.localeCompare(b.time));
  return { items };
}

export async function listOffers(jobseekerId: string) {
  if (!Types.ObjectId.isValid(jobseekerId)) throw new HttpError(404, 'Jobseeker not found', 'not_found');
  const apps = await Application.find({ jobseekerId, 'offer.status': { $in: OFFER_SENT_STATES } }).lean();
  const { emp, drive } = await nameMaps(apps.map((a) => String(a.employerId)), apps.map((a) => String(a.driveId)));
  const items = apps.map((a) => {
    const o = (a.offer ?? {}) as { status?: string; response?: string; ctc?: number; location?: string; mode?: string; joinDate?: Date | null; declineReason?: string };
    return {
      applicationId: String(a._id),
      company: emp.get(String(a.employerId)) ?? '—',
      driveName: drive.get(String(a.driveId)) ?? '—',
      status: o.status ?? '', response: o.response ?? 'Pending',
      ctc: o.ctc ?? 0, location: o.location ?? '', mode: o.mode ?? '',
      joinDate: o.joinDate ? new Date(o.joinDate).toISOString() : null,
      declineReason: o.declineReason ?? '',
    };
  });
  return { items };
}

export async function respondOffer(jobseekerId: string, applicationId: string, input: { response: 'Accepted' | 'Declined'; declineReason?: string }) {
  if (!Types.ObjectId.isValid(applicationId)) throw new HttpError(404, 'Offer not found', 'not_found');
  const app = await Application.findOne({ _id: applicationId, jobseekerId });
  const status = (app?.offer as { status?: string } | undefined)?.status;
  if (!app || !status) throw new HttpError(404, 'Offer not found', 'not_found');
  if (status !== 'Sent') throw new HttpError(400, 'This offer is not awaiting your response', 'offer_not_actionable');
  app.set('offer.response', input.response);
  if (input.response === 'Declined' && input.declineReason) app.set('offer.declineReason', input.declineReason);
  await app.save();
  return { response: (app.offer as { response?: string }).response };
}
```

- [ ] **Step 4: Schema.** Append to `seekerPortal.schemas.ts`:
```ts
export const respondOfferSchema = z.object({ response: z.enum(['Accepted', 'Declined']), declineReason: z.string().max(500).optional() });
export type RespondOfferPayload = z.infer<typeof respondOfferSchema>;
```

- [ ] **Step 5: Controllers + routes.** Add to `seekerPortal.controller.ts` (mirror `revealRequestsController`/`respondRevealController`):
```ts
export async function interviewsController(req: Request, res: Response) { res.json(await listInterviews(req.userId as string)); }
export async function offersController(req: Request, res: Response) { res.json(await listOffers(req.userId as string)); }
export async function respondOfferController(req: Request, res: Response) {
  const input = respondOfferSchema.parse(req.body);
  res.json(await respondOffer(req.userId as string, req.params.applicationId, input));
}
```
(import `listInterviews,listOffers,respondOffer` from the service + `respondOfferSchema` from schemas.) In `seekerPortal.routes.ts` add after the reveal routes:
```ts
seekerPortalRoutes.get('/portal/interviews', asyncHandler(interviewsController));
seekerPortalRoutes.get('/portal/offers', asyncHandler(offersController));
seekerPortalRoutes.post('/portal/offers/:applicationId/respond', asyncHandler(respondOfferController));
```
(add the three controller names to the existing import from `./seekerPortal.controller.js`.)

- [ ] **Step 6: Green + full suite + tsc.** `npm test -w server -- --run test/seeker-activity.route.test.ts && npm test -w server && npx -w server tsc --noEmit`. (Known flaky `eval-configs.service.test.ts` — ignore only that.)

- [ ] **Step 7: Commit** — `git add server/src/modules/seekerPortal server/test/seeker-activity.route.test.ts && git commit -m "feat(server): jobseeker portal interviews + offers read + offer-respond"`

---

## Task 2: Client — reveal-requests section

**Files:** Modify `client/src/types/portal.ts`, `client/src/pages/Portal/index.tsx`; Create `client/src/pages/Portal/RevealRequests.tsx`, `client/src/hooks/useReveal.ts`, `client/src/test/PortalReveal.test.tsx`.

- [ ] **Step 1: Types.** Append to `types/portal.ts`:
```ts
export interface RevealRequestItem { applicationId: string; company: string; driveName: string; status: 'requested' | 'granted' | 'declined'; expired: boolean; requestedAt: string | null; expiresAt: string | null; respondedAt: string | null; }
export interface RevealRequestsData { items: RevealRequestItem[]; }
```

- [ ] **Step 2: Hooks.** Create `client/src/hooks/useReveal.ts` (mirror `usePortal` + a mutation):
```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import type { RevealRequestsData } from '../types/portal.js';

export function useRevealRequests() {
  const { token } = useAuth();
  return useQuery({ queryKey: ['reveal-requests'], queryFn: () => apiFetch<RevealRequestsData>('/me/portal/reveal-requests', { token }), enabled: !!token });
}
export function useRespondReveal() {
  const { token } = useAuth(); const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { applicationId: string; decision: 'grant' | 'deny' }) =>
      apiFetch<{ status: string }>(`/me/portal/reveal-requests/${v.applicationId}/respond`, { method: 'POST', body: { decision: v.decision }, token }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reveal-requests'] }); qc.invalidateQueries({ queryKey: ['portal'] }); },
  });
}
```

- [ ] **Step 3: Failing test.** Create `client/src/test/PortalReveal.test.tsx` (mirror `Portal.test.tsx` harness). Mock `GET /me/portal/reveal-requests` → items: one `requested`+`expired:false` (actionable), one `granted`, one `requested`+`expired:true`. Assert: the requested-not-expired row shows **Grant**/**Deny**; granted shows a "Shared" badge and NO buttons; expired shows "Expired" and no buttons. Clicking **Grant** shows an inline confirm; confirming fires `POST …/respond` with `{decision:'grant'}`. **Deny** fires `{decision:'deny'}`. Empty state when `items:[]`.

- [ ] **Step 4: Component.** Create `client/src/pages/Portal/RevealRequests.tsx`:
```tsx
import { useState } from 'react';
import { useRevealRequests, useRespondReveal } from '../../hooks/useReveal.js';
import type { RevealRequestItem } from '../../types/portal.js';

function label(r: RevealRequestItem): string {
  if (r.status === 'granted') return 'Shared';
  if (r.status === 'declined') return 'Declined';
  if (r.expired) return 'Expired';
  return 'Pending';
}
function tagClass(r: RevealRequestItem): string {
  if (r.status === 'granted') return 'tag selected';
  if (r.status === 'declined' || r.expired) return 'tag closed';
  return 'tag progress';
}

export function RevealRequests() {
  const q = useRevealRequests();
  const respond = useRespondReveal();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const items = q.data?.items ?? [];
  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Identity reveal requests</h2>
      {q.isLoading ? <div className="card" style={{ padding: 16, color: 'var(--muted)' }}>Loading…</div>
        : items.length === 0 ? <div className="portal-empty">No identity reveal requests.</div>
        : <div className="drive-list">
          {items.map((r) => {
            const actionable = r.status === 'requested' && !r.expired;
            return (
              <div className="drive" key={r.applicationId}>
                <div className="info"><b>{r.company}</b><div className="meta">{r.driveName}</div></div>
                <div className="meta" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span className={tagClass(r)}>{label(r)}</span>
                  {actionable && confirmId !== r.applicationId && (
                    <>
                      <button type="button" className="btn" onClick={() => setConfirmId(r.applicationId)}>Grant</button>
                      <button type="button" className="btn" onClick={() => respond.mutate({ applicationId: r.applicationId, decision: 'deny' })}>Deny</button>
                    </>
                  )}
                  {actionable && confirmId === r.applicationId && (
                    <>
                      <span style={{ fontSize: 12 }}>Share your name &amp; contact with {r.company}?</span>
                      <button type="button" className="btn btn-primary" onClick={() => { respond.mutate({ applicationId: r.applicationId, decision: 'grant' }); setConfirmId(null); }}>Confirm</button>
                      <button type="button" className="btn" onClick={() => setConfirmId(null)}>Cancel</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>}
    </div>
  );
}
```
(If `.btn-primary` isn't in the portal's CSS scope, use `.btn` — check `PortalShell` / theme. Keep it working.)

- [ ] **Step 5: Wire into the page.** In `Portal/index.tsx`, import `RevealRequests` and render `<RevealRequests />` after `<StatusCards …/>` and before the "My Drives" block.

- [ ] **Step 6: Green.** `npm test -w client -- --run src/test/PortalReveal.test.tsx`

- [ ] **Step 7: Commit** — `git add client/src/types/portal.ts client/src/hooks/useReveal.ts client/src/pages/Portal/RevealRequests.tsx client/src/pages/Portal/index.tsx client/src/test/PortalReveal.test.tsx && git commit -m "feat(client): jobseeker portal identity reveal-requests section"`

---

## Task 3: Client — interviews + offers sections

**Files:** Modify `client/src/types/portal.ts`, `client/src/pages/Portal/index.tsx`; Create `client/src/pages/Portal/Interviews.tsx`, `client/src/pages/Portal/Offers.tsx`, `client/src/hooks/useActivity.ts`, `client/src/test/PortalActivity.test.tsx`.

- [ ] **Step 1: Types.** Append to `types/portal.ts`:
```ts
export interface InterviewItem { interviewId: string; company: string; driveName: string; date: string | null; start: string; end: string; time: string; status: string; interviewers: string[]; link: string; }
export interface OfferItem { applicationId: string; company: string; driveName: string; status: string; response: string; ctc: number; location: string; mode: string; joinDate: string | null; declineReason: string; }
export interface InterviewsData { items: InterviewItem[]; }
export interface OffersData { items: OfferItem[]; }
```

- [ ] **Step 2: Hooks.** Create `client/src/hooks/useActivity.ts`: `useInterviews()` (query `['interviews']` → `/me/portal/interviews`), `useOffers()` (query `['offers']` → `/me/portal/offers`), `useRespondOffer()` (mutation `POST /me/portal/offers/:id/respond` body `{response, declineReason?}`, invalidate `['offers']`+`['portal']`). Mirror `useReveal.ts`.

- [ ] **Step 3: Failing test.** Create `client/src/test/PortalActivity.test.tsx`. Mock interviews (one item) + offers (one `Sent` w/ `response:'Pending'`, one `Accepted`). Assert: interview row shows company/drive/status + a **Join** link with `href` = the item's `link`; offer `Sent`+Pending shows **Accept**/**Decline**; **Accept** fires `POST …/respond` `{response:'Accepted'}`; **Decline** reveals a reason input then posts `{response:'Declined', …}`; the `Accepted` offer shows no buttons. Empty states.

- [ ] **Step 4: Components.** Create `Interviews.tsx` (section "My interviews": `.drive-list` rows, each `<b>{company}</b>` + `{driveName}` + date/time + `.tag` status + an `<a className="btn" href={link} target="_blank" rel="noreferrer">Join</a>` when `link`; interviewers listed). Create `Offers.tsx` (section "My offers": rows with CTC/location/mode/joinDate + status + response; when `status==='Sent'` and `response==='Pending'` → Accept/Decline, Decline toggles an optional reason `<input>` then submits). Reuse `.card`/`.drive`/`.tag`/`.btn`. Empty states via `.portal-empty`.

- [ ] **Step 5: Wire.** In `Portal/index.tsx`, render `<Interviews />` then `<Offers />` after `<RevealRequests />`, before "My Drives".

- [ ] **Step 6: Green + full client suite + tsc + build.** `npm test -w client -- --run src/test/PortalActivity.test.tsx && npm test -w client && npx -w client tsc --noEmit && npm run -w client build`

- [ ] **Step 7: Commit** — `git add client/src/types/portal.ts client/src/hooks/useActivity.ts client/src/pages/Portal/Interviews.tsx client/src/pages/Portal/Offers.tsx client/src/pages/Portal/index.tsx client/src/test/PortalActivity.test.tsx && git commit -m "feat(client): jobseeker portal my-interviews + my-offers sections"`

---

## Notes
- Interviews are view-only (employer-managed); offers set only `offer.response` (never employer-owned `status`/ctc). All identity via `req.userId`. Reuse existing `.tag`/`.drive`/`.btn` classes; add minimal CSS only if a control is unstyled (put it in `portal.css`).
