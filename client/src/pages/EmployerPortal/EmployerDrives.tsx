import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEmployerDrives } from './hooks/useEmployerDrives.js';
import type { EmployerDriveListItem } from '../../types/employer.js';
import './employerBase.js';

// Ported from the prototype Matchday_Employer.html's #page-drives (~2776-2827: .mkt-head /
// .mkt-filters / .mkt-count / .drive-grid) and the marketplace's `driveCard` template
// (~4229-4283, rendered by `renderMarketplace`). Renders inside EmployerShell's ".page active"
// content area (App.tsx), which already provides the ".employer-app" CSS scope — this
// component intentionally does NOT re-wrap in ".employer-app" (only ".page-wrap", matching the
// prototype's inner markup, same convention as EmployerDashboard.tsx).
//
// The prototype's marketplace is a richer, purely client-side demo (candidate-pool counts,
// evaluation/match-ready progress bars, a stream/level/status taxonomy that doesn't exist in
// this slice's data model). The live GET /api/me/employer/drives (Task 1) instead returns the
// real Drive projection: { id, name, domain, stream, month, primaryEventDate, eventDates,
// candCap, empCap, slotCap, frequency, eventDay, status, employerReg, canRegister }. So this
// ports the .mkt-head/.mkt-filters/.mkt-count/.drive-grid/.dcard scaffolding faithfully but
// swaps the demo pool/eval/match-ready stats for the facts the API actually has (month, event
// day/frequency, and the three capacities), and swaps the prototype's fake stream taxonomy
// (data/ml/dataeng/genai) for a domain filter built from the seed's real `Drive.domain` set —
// see the domain-chip mapping note below.
//
// Domain-chip mapping: verified against server/src/seed/seed.ts's drive fixture (`domain:
// pick(rng, ['Frontend', 'Backend', 'Full-stack', 'Data / ML', 'DevOps'])`) — these are the
// only five domain values the seed ever produces, and `Drive.domain` has no schema-level enum
// (server/src/models/Drive.ts: `domain: { type: String, default: '' }`), so the chips below are
// exact-value filters over that real set rather than the prototype's synthetic stream keys.

const DOMAIN_CHIPS: { label: string; value: string }[] = [
  { label: 'All domains', value: '' },
  { label: 'Frontend', value: 'Frontend' },
  { label: 'Backend', value: 'Backend' },
  { label: 'Full-stack', value: 'Full-stack' },
  { label: 'Data / ML', value: 'Data / ML' },
  { label: 'DevOps', value: 'DevOps' },
];

function registrationMeta(item: EmployerDriveListItem): { cls: string; label: string } {
  if (item.employerReg === 'Open') return { cls: 'st-open', label: 'Registration open' };
  if (item.employerReg === 'Closed') return { cls: 'st-closed', label: 'Registration closed' };
  return { cls: 'st-wait', label: item.employerReg };
}

function DriveCard({ drive, onView, onRegister }: {
  drive: EmployerDriveListItem;
  onView: () => void;
  onRegister: () => void;
}) {
  const reg = registrationMeta(drive);
  return (
    <div className="dcard">
      <div className="dcard-top">
        <span className="d-ic">
          <svg className="ic ic-lg" viewBox="0 0 24 24"><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 4-5" /></svg>
        </span>
        <div style={{ minWidth: 0 }}>
          <h3>{drive.name}</h3>
          <div className="d-stream">{drive.domain} · {drive.stream}</div>
        </div>
        <span className={`status-pill ${reg.cls}`}>{reg.label}</span>
      </div>

      <div className="dmeta-grid">
        <div className="dmeta-item">
          <span className="mi-ic">
            <svg className="ic ic-sm" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /></svg>
          </span>
          <div><div className="mv">{drive.month}</div><div className="ml2">Next MatchDay</div></div>
        </div>
        <div className="dmeta-item">
          <span className="mi-ic">
            <svg className="ic ic-sm" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0112 0" /></svg>
          </span>
          <div><div className="mv">{drive.candCap}</div><div className="ml2">Candidate cap</div></div>
        </div>
        <div className="dmeta-item">
          <span className="mi-ic">
            <svg className="ic ic-sm" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
          </span>
          <div><div className="mv">{drive.empCap}</div><div className="ml2">Employer cap</div></div>
        </div>
        <div className="dmeta-item">
          <span className="mi-ic">
            <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
          </span>
          <div><div className="mv">{drive.slotCap}</div><div className="ml2">Slot cap</div></div>
        </div>
      </div>

      <div className="dcard-foot">
        <button type="button" className="btn btn-ghost" onClick={onView}>View</button>
        {drive.canRegister && (
          <button type="button" className="btn btn-primary" onClick={onRegister}>Register</button>
        )}
      </div>
    </div>
  );
}

export function EmployerDrives() {
  const [q, setQ] = useState('');
  const [domain, setDomain] = useState('');
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useEmployerDrives({ q, domain });

  const items = data?.items ?? [];

  return (
    <div className="page-wrap">
      <div className="mkt-head">
        <div className="mh-t">
          <h2>Available MatchDay drives</h2>
          <p>Browse open drives, check the facts, and register your role against a stream.</p>
        </div>
        <span className="privacy-chip">
          <svg className="ic ic-sm" viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
          Aggregate view — no candidate identities shown
        </span>
      </div>

      <div className="mkt-filters">
        <div className="mkt-search">
          <svg className="ic" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input
            placeholder="Search drives or streams…"
            aria-label="Search drives"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="chip-group">
          {DOMAIN_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className={`fchip${domain === chip.value ? ' on' : ''}`}
              onClick={() => setDomain(chip.value)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="card" style={{ padding: 20, color: 'var(--grey)' }}>Loading drives…</div>
      )}
      {isError && (
        <div className="card" style={{ padding: 20, color: '#e0463c' }}>
          Failed to load drives: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {data && (
        <>
          <div className="mkt-count">
            Showing <b>{items.length}</b> drive{items.length === 1 ? '' : 's'}
          </div>

          {items.length === 0 ? (
            <div className="mkt-empty">
              <div className="me-ic">
                <svg className="ic ic-lg" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
              </div>
              <h3>No drives match your filters</h3>
              <p>Try clearing a filter or searching a different term.</p>
            </div>
          ) : (
            <div className="drive-grid">
              {items.map((drive) => (
                <DriveCard
                  key={drive.id}
                  drive={drive}
                  onView={() => navigate(`/employer/drives/${drive.id}`)}
                  onRegister={() => navigate('/employer/coming-soon/register')}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
