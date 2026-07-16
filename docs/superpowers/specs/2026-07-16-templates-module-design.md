# Templates Module — MERN Slice Design

**Date:** 2026-07-16
**Status:** Approved design, pending implementation plan
**Depends on:** the six prior slices — reuses auth, app shell, and all conventions. Self-contained: no Command Center impact, no cross-module migrations.
**Source prototype:** `matchday-admin-app_23.html` — Template Management page (lines 1400–1436), editor + version runtime (lines 2780–2990).

## 1. Goal & Scope

The seventh vertical slice: a **drive-templates library** — reusable drive-configuration templates with a six-tab editor and version history — replacing the "Coming soon" placeholder at the `Templates` nav.

### In scope
- **Library page** (`/templates`): search (name/domain), domain + status filters, **Cards/Table view toggle** (`.seg`, cards default), Create Template.
  - **Cards** (`.tpl-grid`/`.tpl-card`): domain icon (tplIcons map), name, `v{version}` badge, status badge (Active→st-active, Inactive→st-draft), "Updated {relative}", six section-count tiles (N assessment · weightage set · N match rules · N stages · N notifications · N privacy rules), footer "Used by N drive(s)" + Edit / Clone / More. Inactive cards get the `inactive` class.
  - **Table**: name + `TPL-{###}` code, domain chip, version, sections summary ("N asmt · N stages · N notif"), used-by, status, updated, row actions.
  - **Kebab (More)**: Edit template · Clone template · Version history · Activate/Deactivate · Delete (confirm).
- **Editor modal** (create/edit): name, domain select, status select + **six tabs**:
  1. **Assessment** — 4 stage toggles (mcq/coding/tara/assignments).
  2. **Weightage** — a slider per scored stage (MCQ/Coding/TARA/Assignment, 0–100); a **Total** indicator styled `good` at exactly 100% else `bad` (display-only; saving is not blocked — prototype parity).
  3. **Matching** — sliders for Skills/Experience/Domain fit/Location + a threshold slider.
  4. **Kanban stages** — ordered list with add (input+button/Enter) and per-item remove.
  5. **Notifications** — per event (Shortlisted / Interview scheduled / Offer sent / Rejected), toggleable channel chips Email/WhatsApp/Bell.
  6. **Privacy** — 4 boolean switches (Mask contact until shortlist / Hide salary from institutes / Require GDPR consent / Watermark resumes).
- **Version history modal**: entries (v / note / date / by), current marked; **Restore** on older entries → bumps version with note "Restored v{X}".
- **Versioning rules** (prototype-exact): create → v1.0 + "Initial template" entry; editor save → minor bump (`2.1`→`2.2`) + "Edited configuration" entry; status toggle → NO bump, no entry; clone → new doc "{name} (Copy)", v1.0, Inactive, usedBy 0, entry "Cloned from {name}"; restore → minor bump + "Restored v{X}" entry.
- Sidebar "Templates" → `/templates`.

### Out of scope (deferred)
- A drive↔template link (drives don't reference templates anywhere in the prototype; `usedBy` is a stored stat).
- Kanban stage drag-reorder (the prototype explicitly says "Reorder isn't shown here").
- Applying a template to the Drive wizard (no such flow exists in the prototype).

## 2. Confirmed Decisions

| Decision | Choice |
|---|---|
| `usedBy` | Stored stat (seeded; no link to derive from) — same convention as employer stats |
| Version bump | PATCH containing `sections` (the editor path) bumps + logs; status-only PATCH doesn't |
| Weightage ≠ 100% | Display-only good/bad indicator; save NOT blocked (prototype parity) |
| "Updated X ago" | Derived client-side from `updatedAt` (relative-time helper, as in Approvals) |
| Section maps with spaced keys | `Schema.Types.Mixed` at the model layer; exact shape enforced by zod at the API |

## 3. Schema — `DriveTemplate` (new collection)

```ts
DriveTemplate {
  name: string;
  domain: string;               // Data / Analytics | Data Engineering | Machine Learning | GenAI | Business (zod enum)
  status: 'Active' | 'Inactive';
  usedBy: number;               // stored stat, default 0
  sections: {
    assessment: { mcq: boolean; coding: boolean; tara: boolean; assignments: boolean };
    weightage: Record<string, number>;      // { MCQ, Coding, TARA, Assignment } (Mixed)
    matching: Record<string, number>;       // { Skills, Experience, 'Domain fit', Location, threshold } (Mixed)
    kanban: string[];
    notifications: { name: string; ch: string[] }[];   // ch ⊆ [Email, WhatsApp, Bell]
    privacy: Record<string, boolean>;       // the 4 spaced-key rules (Mixed)
  };
  version: string;              // '2.1'
  versions: { v: string; date: Date; by: string; note: string }[];   // newest first
  createdAt: Date;              // explicit (no timestamps — convention)
  updatedAt: Date;              // explicit, set by the service on every mutation
}
```
`bumpVersion('2.1') → '2.2'` (increment the minor part; `'1' → '1.1'`).

## 4. API (`/api/templates`, protected by `requireAuth`)

Standard error contract. Domain zod enum: the five values above.

- **`GET /`** — `q` (name/domain contains, case-insensitive), `domain`, `status`. Returns `{ items: TemplateItem[] }` (all matching, newest-updated first; the library is small — no pagination, matching the prototype). `TemplateItem` = the full doc fields + `id` + `code` (`TPL-` + last 3 hex of id, uppercased — display-only like the jobseekers code).
- **`POST /`** — `{ name (min 1), domain (enum), status (default 'Active'), sections (full zod shape: assessment 4 bools; weightage numbers 0–100; matching numbers 0–100 incl. threshold; kanban string[] min 1; notifications [{name, ch ⊆ enum}]; privacy record of bools) }`. Creates v1.0 with `versions: [{v:'1.0', date: now, by: actor, note: 'Initial template'}]`. → 201.
- **`GET /:id`** — full doc; 404.
- **`PATCH /:id`** — partial `{ name?, domain?, status?, sections? }`. **If `sections` present** → `version = bumpVersion(version)` + unshift `{v, date: now, by: actor, note: 'Edited configuration'}`. Always sets `updatedAt`. 404.
- **`POST /:id/clone`** — new doc: `name: '{name} (Copy)'`, same domain/sections, `status:'Inactive'`, `usedBy:0`, `version:'1.0'`, versions `[{v:'1.0', ..., note: 'Cloned from {name}'}]`. → 201.
- **`POST /:id/restore`** — `{ v: string }` (must exist in `versions`, else 400 validation). `version = bumpVersion(current)` + unshift `{v: newV, ..., note: 'Restored v{v}'}`; `updatedAt` set. (Sections are NOT rolled back — prototype parity: restore is a version-ledger operation only.)
- **`DELETE /:id`** — `{ deleted: true }`; 404.

Module: `server/src/modules/templates/` (schemas/service/controller/routes). New model `server/src/models/DriveTemplate.ts`. Mounted before `errorHandler`; `/:id/clone` + `/:id/restore` before... (distinct methods; declare sub-paths before bare `/:id` per convention anyway).

## 5. Frontend

Route `/templates` (protected). Sidebar "Templates" → `/templates`.

`client/src/pages/Templates/`:
- `index.tsx` — AppShell (crumb "Library", title "Drive Templates"); state `view` (cards default), filters, `editor` ({mode:'create'} | {mode:'edit', template} | null), `versions` (template | null), kebab state. `useTemplates(params)` (key `['templates', params]`). Toolbar per prototype (search, domain/status selects, `.seg` Cards/Table toggle, Create).
- `TemplateCards.tsx` + `TemplateTable.tsx` — presentational; section counts computed from `sections` (assess = enabled assessment count; match = matching keys minus threshold; priv = true-valued privacy count); tplIcons domain→[icon, colorClass] map; relative-updated helper.
- `TemplateKebab` — inline menu (Edit/Clone/Version history/Activate↔Deactivate/Delete-confirm) following the established row-menu pattern.
- `TemplateEditorModal.tsx` — name/domain/status header fields + `.ed-tab` tab bar + the six panes (port the prototype's pane markup: `.asmt-row`/`.switch`, `.wt-row` range inputs + `.wt-total` good/bad, `.match-row`, `.stage-list`/`.stage-item`/`.stage-add`, `.notif-row`/`.chn`/`.cw`, `.priv-row`). Local draft state (deep-copied); Save → create/patch mutation ({name, domain, status, sections}); name required (inline).
- `VersionHistoryModal.tsx` — `.ver-item` list (`.vtag`, note, date · by, `cur` marking, Restore button) → restore mutation.
- `hooks/useTemplates.ts`, `useTemplateMutations.ts` (create/update/clone/restore/remove → invalidate `['templates']`).

## 6. Seed

`server/src/seed/seed.ts` — 5 templates exactly as the prototype (names/domains/statuses/usedBy/section overrides via a `baseSections(over)` helper mirroring the prototype's) with their full version histories converted to real Dates (`Date.UTC` values matching the prototype's labels: Jul 10 2026, Jun 22 2026, etc.). `updatedAt` values chosen so the relative labels read like the prototype ("2 days ago" from the in-world date). `DriveTemplate` added to the deleteMany group. Deterministic.

## 7. Testing (TDD)

- **Server**: list filters; create (v1.0 + initial entry); **PATCH with sections bumps version + logs, status-only doesn't**; clone semantics (Copy/Inactive/1.0/usedBy 0/entry); restore (bump + note; unknown v → 400); delete + 404s; zod bounds (weightage >100 per-key rejected, bad channel rejected).
- **Client**: cards render counts/badges from a mocked list + view toggle swaps to table; editor: tab switching renders panes, weightage total indicator flips good/bad, save fires the right payload (mocked); version modal renders entries + restore fires (mocked).

## 8. File Structure Additions

```
server/src/
  models/DriveTemplate.ts
  modules/templates/
    templates.schemas.ts templates.service.ts templates.controller.ts templates.routes.ts
  seed/seed.ts
server/test/
  templates.service.test.ts templates.route.test.ts
client/src/
  types/templates.ts
  pages/Templates/
    index.tsx TemplateCards.tsx TemplateTable.tsx TemplateEditorModal.tsx VersionHistoryModal.tsx
    hooks/useTemplates.ts useTemplateMutations.ts
  App.tsx components/Sidebar.tsx
client/src/test/
  TemplateCards.test.tsx TemplateEditor.test.tsx
```

## 9. Status Model

`Active` ↔ `Inactive` (kebab toggle; no version bump). Inactive templates render dimmed (`inactive` card class / `st-draft` badge) and remain fully editable/cloneable. Delete is permanent (confirm dialog).
