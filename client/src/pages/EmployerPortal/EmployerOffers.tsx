import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEmployerOffers, useUpsertOffer } from './hooks/useEmployerOffers.js';
import { useEmployerCandidates } from './hooks/useEmployerCandidates.js';
import type { EmployerOffer, OfferInput, OfferStatus } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

// Ported per the Slice 9 (offers) task brief. Renders inside EmployerShell's ".page active"
// content area -- intentionally does NOT re-wrap in ".employer-app" (only ".page-wrap"), same
// convention as EmployerKanban.tsx/EmployerCandidates.tsx. Reuses the ported .kpi-grid/.kpi/.kn/
// .klabel/.status-pill/.reveal/.otp-err/.cand-empty CSS (employer.css); `.cand-row` here is a
// marker class only (no CSS rule for it, matches EmployerCandidates.tsx's convention) so its
// row layout is inline.
//
// Each offer row carries its own local edit state (status/response/ctc/location/mode/joinDate/
// declineReason) seeded from the fetched offer -- edits are held locally and only sent to the
// server when "Update" is clicked (no autosave). The New-offer picker lists only consent-granted
// candidates (Shortlisted decision) who don't already have an offer row.

function errMsg(e: unknown): string { return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong'; }
const STATUSES: OfferStatus[] = ['Draft', 'Sent', 'Accepted', 'Declined', 'Joined'];
const RESPONSES = ['Pending', 'Negotiating', 'Accepted', 'Declined'] as const;
const MODES = ['On-site', 'Hybrid', 'Remote'] as const;
const STATUS_CLS: Record<string, string> = { Draft: 'st-draft', Sent: 'st-inprog', Accepted: 'st-approved', Declined: 'st-cancelled', Joined: 'st-approved' };

function OfferRowForm({ offer, onSave, saving }: { offer: EmployerOffer; onSave: (o: OfferInput) => void; saving: boolean }) {
  const [f, setF] = useState<OfferInput>({ status: offer.status, response: offer.response, ctc: offer.ctc, location: offer.location, mode: offer.mode, joinDate: offer.joinDate?.slice(0, 10), declineReason: offer.declineReason });
  return (
    <div className="cand-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line, #eee)' }}>
      <div className="reveal" style={{ minWidth: 150 }}><div className="rn">{offer.revealed.name}</div><div className="re">{offer.code} · match {offer.matchScore}</div></div>
      <span className={`status-pill ${STATUS_CLS[offer.status] ?? 'st-inprog'}`}>{offer.status}</span>
      <select className="select" aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as OfferStatus })} style={{ maxWidth: 130 }}>
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className="select" aria-label="Response" value={f.response} onChange={(e) => setF({ ...f, response: e.target.value as OfferInput['response'] })} style={{ maxWidth: 130 }}>
        {RESPONSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <input className="input" aria-label="CTC" type="number" value={f.ctc ?? 0} onChange={(e) => setF({ ...f, ctc: Number(e.target.value) })} style={{ maxWidth: 90 }} />
      <input className="input" aria-label="Location" value={f.location ?? ''} onChange={(e) => setF({ ...f, location: e.target.value })} style={{ maxWidth: 130 }} />
      <select className="select" aria-label="Mode" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as OfferInput['mode'] })} style={{ maxWidth: 110 }}>
        {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <input className="input" aria-label="Join date" type="date" value={f.joinDate ?? ''} onChange={(e) => setF({ ...f, joinDate: e.target.value })} style={{ maxWidth: 150 }} />
      {(f.status === 'Declined' || f.response === 'Declined') && (
        <input className="input" aria-label="Decline reason" placeholder="Decline reason" value={f.declineReason ?? ''} onChange={(e) => setF({ ...f, declineReason: e.target.value })} style={{ maxWidth: 200 }} />
      )}
      <button type="button" className="btn btn-primary" disabled={saving} onClick={() => onSave(f)}>Update</button>
    </div>
  );
}

export function EmployerOffers() {
  const { id } = useParams();
  const driveId = id!;
  const navigate = useNavigate();
  const offers = useEmployerOffers(driveId);
  const candidates = useEmployerCandidates(driveId, { decision: 'Shortlisted' });
  const upsert = useUpsertOffer(driveId);
  const items = useMemo(() => offers.data?.items ?? [], [offers.data]);
  const counts = offers.data?.counts;
  const [newJs, setNewJs] = useState('');

  const offeredIds = new Set(items.map((o) => o.jobseekerId));
  const candidatesForNew = (candidates.data?.items ?? []).filter((c) => c.consent?.status === 'granted' && !offeredIds.has(c.jobseekerId));

  return (
    <div className="page-wrap">
      <button type="button" className="link-back dd-back" onClick={() => navigate(`/employer/drives/${driveId}/board`)}>
        <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg> Back to pipeline
      </button>
      <div className="card"><h2>Offer management</h2><p className="hint">Track offers for consented jobseekers. Status changes move the jobseeker on the pipeline board.</p></div>

      {counts && (
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
          {STATUSES.map((s) => (
            <div className="kpi" key={s}><div className="klabel">{s}</div><div className="kn">{counts[s] ?? 0}</div></div>
          ))}
        </div>
      )}

      {upsert.isError && <p className="otp-err" role="alert">{errMsg(upsert.error)}</p>}

      <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>New offer:</strong>
        <select className="select" aria-label="New offer jobseeker" value={newJs} onChange={(e) => setNewJs(e.target.value)} style={{ maxWidth: 240 }}>
          <option value="">Select a consented jobseeker…</option>
          {candidatesForNew.map((c) => <option key={c.jobseekerId} value={c.jobseekerId}>{c.code}</option>)}
        </select>
        <button type="button" className="btn btn-ghost" disabled={!newJs || upsert.isPending}
          onClick={() => upsert.mutate({ jobseekerId: newJs, status: 'Sent' }, { onSuccess: () => setNewJs('') })}>Send offer</button>
      </div>

      <div className="card">
        {offers.isLoading ? <p className="hint">Loading…</p>
          : offers.isError ? <p className="hint">{errMsg(offers.error)}</p>
          : items.length === 0 ? <p className="cand-empty hint">No offers yet — send an offer to a consented jobseeker above.</p>
          : (
            <div style={{ display: 'grid', gap: 4 }}>
              {items.map((o) => (
                <OfferRowForm key={o.jobseekerId} offer={o} saving={upsert.isPending}
                  onSave={(f) => upsert.mutate({ jobseekerId: o.jobseekerId, ...f })} />
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
