import { useState, type FormEvent } from 'react';
import { useEmployerTeam, useAddTeamMember, useUpdateTeamMember, useRemoveTeamMember } from './hooks/useEmployerTeam.js';
import { TEAM_ROLES, type TeamRole } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

// Ported from the prototype Matchday_Employer.html's team/access page (Slice 13): a members
// list backed by Task 1's teamListController, an admin-gated add-member form
// (addTeamMemberController), per-row role reassignment (updateTeamMemberController), and
// removal (removeTeamMemberController). Renders inside EmployerShell (App.tsx) which already
// provides the ".employer-app" CSS scope, so this intentionally does NOT re-wrap in
// ".employer-app" (same convention as EmployerSupport.tsx).
function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}
function errMsg(e: unknown): string { return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong'; }

export function EmployerTeam() {
  const team = useEmployerTeam();
  const add = useAddTeamMember();
  const update = useUpdateTeamMember();
  const remove = useRemoveTeamMember();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('Recruiter');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  const canManage = team.data?.canManage ?? false;
  const selfId = team.data?.selfId ?? null;
  const members = team.data?.members ?? [];

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    if (!name.trim() || !email.trim() || password.length < 8) { setErr('Name, email, and a password of at least 8 characters are required.'); return; }
    add.mutate({ name: name.trim(), email: email.trim(), role, password }, {
      onSuccess: () => { setName(''); setEmail(''); setRole('Recruiter'); setPassword(''); },
      onError: (e2) => setErr(errMsg(e2)),
    });
  }

  return (
    <div className="page-wrap">
      <div className="dash-greet"><h2>Team &amp; access</h2><p>Add teammates, assign roles, and manage who can access your MatchDay workspace.</p></div>

      {team.isLoading ? <p className="hint">Loading…</p>
        : team.isError ? <p className="hint">{errMsg(team.error)}</p>
        : (
          <>
            <div className="card">
              <div className="card-head"><h3>Members</h3></div>
              <div className="card-body">
                {members.length === 0 ? <p className="hint">No teammates yet.</p> : members.map((m) => (
                  <div className="member-row" key={m.id}>
                    <span className="member-av">{initials(m.name)}</span>
                    <div className="member-info"><div className="mn">{m.name}</div><div className="me">{m.email}</div></div>
                    {canManage && m.id !== selfId
                      ? <select className="select" value={m.role} aria-label={`Role for ${m.name}`} onChange={(e) => update.mutate({ id: m.id, role: e.target.value })}>{TEAM_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                      : <span className="role-badge">{m.role}</span>}
                    <span className={`status-pill ${m.status === 'Active' ? 'st-approved' : 'st-cancelled'}`}>{m.status}</span>
                    {canManage && m.id !== selfId && (
                      <button type="button" className="member-x" aria-label={`Remove ${m.name}`} onClick={() => remove.mutate(m.id)}>✕</button>
                    )}
                  </div>
                ))}

                {canManage ? (
                  <form className="add-row" onSubmit={submit} style={{ marginTop: 14 }}>
                    <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
                    <input className="input" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    <select className="select" value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>{TEAM_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                    <input className="input" placeholder="Temp password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    <button type="submit" className="btn btn-primary" disabled={add.isPending}>{add.isPending ? 'Adding…' : 'Add member'}</button>
                  </form>
                ) : (
                  <div className="access-note" style={{ marginTop: 14 }}>Only admins can manage team access. You have {team.data?.actingRole} access.</div>
                )}
                {err && <div role="alert" style={{ color: '#b42318', fontSize: 13, marginTop: 8 }}>{err}</div>}
              </div>
            </div>
          </>
        )}
    </div>
  );
}
