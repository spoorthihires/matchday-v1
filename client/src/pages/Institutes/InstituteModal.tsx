import { useState } from 'react';
import { ApiError } from '../../api/client.js';
import type { InstituteInput, InstituteListItem } from '../../types/institutes.js';
import { STATUS_OPTIONS, TYPE_OPTIONS } from './constants.js';
import { useInstituteMutations } from './hooks/useInstituteMutations.js';

// Ported from matchday-admin-app_23.html lines 1552-1564 (#instModal .modal-scrim/.modal) and the
// openInstEditor()/imSave handler around lines 3762-3773. The status field (#imStatusFld) is only
// shown when editing (`x?'':'none'` in the prototype) — new institutes always start Pending on the
// server (createInstituteSchema defaults status to 'Pending'), so the create form omits it.
//
// The prototype only checks `name` client-side (everything else is a mock with no real backend to
// reject bad input). Here name/city/owner/email are all `min(1)` on the server's
// createInstituteSchema/updateInstituteSchema (institutes.schemas.ts), and email must additionally
// be a valid address — so this port validates all four inline before submitting, rather than
// letting blank required fields round-trip as an opaque "Invalid request" 400.

export interface InstituteModalProps {
  mode: 'create' | 'edit';
  institute?: InstituteListItem;
  onClose: () => void;
}

interface FormState { name: string; type: string; city: string; owner: string; email: string; status: string; }

function blankForm(institute?: InstituteListItem): FormState {
  return {
    name: institute?.name ?? '',
    type: institute?.type ?? TYPE_OPTIONS[0],
    city: institute?.city ?? '',
    owner: institute?.owner ?? '',
    email: institute?.email ?? '',
    status: institute?.status ?? 'Pending',
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RequiredField = 'name' | 'city' | 'owner' | 'email';

export function InstituteModal({ mode, institute, onClose }: InstituteModalProps) {
  const { create, update } = useInstituteMutations();
  const [form, setForm] = useState<FormState>(() => blankForm(institute));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RequiredField, boolean>>>({});
  const [error, setError] = useState<string | null>(null);

  const pending = create.isPending || update.isPending;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Mirrors the server's createInstituteSchema/updateInstituteSchema: name/city/owner
  // trim().min(1), email trim().email(). Validating here surfaces a specific, actionable
  // message instead of letting a blank required field round-trip as a generic 400.
  function validate(): { name: string; city: string; owner: string; email: string } | null {
    const name = form.name.trim();
    const city = form.city.trim();
    const owner = form.owner.trim();
    const email = form.email.trim();
    const errors: Partial<Record<RequiredField, boolean>> = {
      name: !name,
      city: !city,
      owner: !owner,
      email: !email || !EMAIL_RE.test(email),
    };
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      setError('Please fill in all required fields with a valid email.');
      return null;
    }
    setError(null);
    return { name, city, owner, email };
  }

  async function handleSave() {
    const valid = validate();
    if (!valid) return;

    const body: InstituteInput = { ...valid, type: form.type };

    try {
      if (mode === 'edit' && institute) {
        await update.mutateAsync({ id: institute.id, body: { ...body, status: form.status } });
      } else {
        await create.mutateAsync(body);
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.code === 'validation' ? `${err.message} — please check the required fields.` : err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    }
  }

  return (
    <div className="modal-scrim show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="imTitle">
        <div className="modal-h">
          <div>
            <h3 id="imTitle">{mode === 'edit' ? 'Edit Institute' : 'Create Institute'}</h3>
            <p>Onboard an institute to participate in MatchDay drives.</p>
          </div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-b">
          {error && (
            <div className="fld full" style={{ color: 'var(--danger)', fontSize: 12.5 }}>{error}</div>
          )}
          <div className="fld full">
            <label htmlFor="imName">Institute name</label>
            <input
              id="imName"
              placeholder="e.g. VNR Vignana Jyothi"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              style={fieldErrors.name ? { borderColor: 'var(--danger)' } : undefined}
            />
          </div>
          <div className="fld">
            <label htmlFor="imType">Type</label>
            <select id="imType" value={form.type} onChange={(e) => set('type', e.target.value)}>
              {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="imCity">City</label>
            <input
              id="imCity"
              placeholder="e.g. Hyderabad"
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              style={fieldErrors.city ? { borderColor: 'var(--danger)' } : undefined}
            />
          </div>
          <div className="fld">
            <label htmlFor="imOwner">Owner / SPOC</label>
            <input
              id="imOwner"
              placeholder="Full name"
              value={form.owner}
              onChange={(e) => set('owner', e.target.value)}
              style={fieldErrors.owner ? { borderColor: 'var(--danger)' } : undefined}
            />
          </div>
          <div className="fld">
            <label htmlFor="imEmail">Contact email</label>
            <input
              id="imEmail"
              type="email"
              placeholder="spoc@institute.edu"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              style={fieldErrors.email ? { borderColor: 'var(--danger)' } : undefined}
            />
          </div>
          {mode === 'edit' && (
            <div className="fld full">
              <label htmlFor="imStatus">Status</label>
              <select id="imStatus" value={form.status} onChange={(e) => set('status', e.target.value)}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="modal-f">
          <div className="grow" />
          <button className="btn btn-ghost btn-lg" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" disabled={pending} onClick={handleSave}>
            <i className="ti ti-device-floppy" /> {pending ? 'Saving…' : 'Save institute'}
          </button>
        </div>
      </div>
    </div>
  );
}
