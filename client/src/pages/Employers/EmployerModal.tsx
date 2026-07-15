import { useState } from 'react';
import { ApiError } from '../../api/client.js';
import type { EmployerInput, EmployerListItem } from '../../types/employers.js';
import { INDUSTRY_OPTIONS, SIZE_OPTIONS, STATUS_OPTIONS } from './constants.js';
import { useEmployerMutations } from './hooks/useEmployerMutations.js';

// Ported from matchday-admin-app_23.html lines 1943-1956 (#empModal .modal-scrim/.modal) and the
// openEmpEditor()/empmSave handler around lines 3455-3470. The status field (#empmStatusFld) is
// only shown when editing (`x?'':'none'` in the prototype) — new employers always start Pending
// on the server (createEmployerSchema defaults status to 'Pending'), so the create form omits it.
//
// The prototype only checks `name` client-side (everything else is a mock with no real backend to
// reject bad input). Here name is required and email must be a valid address or empty on the
// server's createEmployerSchema/updateEmployerSchema (employers.schemas.ts) — so this port
// validates both inline before submitting, rather than letting a blank/invalid field round-trip
// as an opaque "Invalid request" 400.

export interface EmployerModalProps {
  mode: 'create' | 'edit';
  employer?: EmployerListItem;
  onClose: () => void;
}

interface FormState { name: string; industry: string; size: string; spoc: string; email: string; status: string; }

function blankForm(employer?: EmployerListItem): FormState {
  return {
    name: employer?.name ?? '',
    industry: employer?.industry ?? INDUSTRY_OPTIONS[0],
    size: employer?.size ?? SIZE_OPTIONS[1],
    spoc: employer?.spoc ?? '',
    email: employer?.email ?? '',
    status: employer?.status ?? 'Pending',
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmployerModal({ mode, employer, onClose }: EmployerModalProps) {
  const { create, update } = useEmployerMutations();
  const [form, setForm] = useState<FormState>(() => blankForm(employer));
  const [nameError, setNameError] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = create.isPending || update.isPending;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Mirrors the server's createEmployerSchema/updateEmployerSchema: name trim().min(1),
  // email trim().email().or(''). Validating here surfaces a specific, actionable message instead
  // of letting a blank/invalid field round-trip as a generic 400.
  function validate(): { name: string; email: string } | null {
    const name = form.name.trim();
    const email = form.email.trim();
    const badName = !name;
    const badEmail = email !== '' && !EMAIL_RE.test(email);
    setNameError(badName);
    setEmailError(badEmail);
    if (badName || badEmail) {
      setError(badName ? 'Employer name is required.' : 'Please enter a valid contact email, or leave it blank.');
      return null;
    }
    setError(null);
    return { name, email };
  }

  async function handleSave() {
    const valid = validate();
    if (!valid) return;

    const body: EmployerInput = { ...valid, industry: form.industry, size: form.size, spoc: form.spoc.trim() };

    try {
      if (mode === 'edit' && employer) {
        await update.mutateAsync({ id: employer.id, body: { ...body, status: form.status } });
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
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="empmTitle">
        <div className="modal-h">
          <div>
            <h3 id="empmTitle">{mode === 'edit' ? 'Edit Employer' : 'Create Employer'}</h3>
            <p>Onboard an employer to hire through MatchDay drives.</p>
          </div>
          <button className="x" aria-label="Close" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-b">
          {error && (
            <div className="fld full" style={{ color: 'var(--danger)', fontSize: 12.5 }}>{error}</div>
          )}
          <div className="fld full">
            <label htmlFor="empmName">Employer name</label>
            <input
              id="empmName"
              placeholder="e.g. Nexatech Labs"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              style={nameError ? { borderColor: 'var(--danger)' } : undefined}
            />
          </div>
          <div className="fld">
            <label htmlFor="empmIndustry">Industry</label>
            <select id="empmIndustry" value={form.industry} onChange={(e) => set('industry', e.target.value)}>
              {INDUSTRY_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="empmSize">Company size</label>
            <select id="empmSize" value={form.size} onChange={(e) => set('size', e.target.value)}>
              {SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="empmSpoc">Hiring SPOC</label>
            <input
              id="empmSpoc"
              placeholder="Full name"
              value={form.spoc}
              onChange={(e) => set('spoc', e.target.value)}
            />
          </div>
          <div className="fld">
            <label htmlFor="empmEmail">Contact email</label>
            <input
              id="empmEmail"
              type="email"
              placeholder="talent@company.com"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              style={emailError ? { borderColor: 'var(--danger)' } : undefined}
            />
          </div>
          {mode === 'edit' && (
            <div className="fld full">
              <label htmlFor="empmStatus">Status</label>
              <select id="empmStatus" value={form.status} onChange={(e) => set('status', e.target.value)}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="modal-f">
          <div className="grow" />
          <button className="btn btn-ghost btn-lg" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-lg" disabled={pending} onClick={handleSave}>
            <i className="ti ti-device-floppy" /> {pending ? 'Saving…' : 'Save employer'}
          </button>
        </div>
      </div>
    </div>
  );
}
