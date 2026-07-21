import { useState, type FormEvent } from 'react';
import { useEmployerSupport, useCreateSupportRequest } from './hooks/useEmployerSupport.js';
import { formatRelativeTime } from './hooks/useEmployerNotifications.js';
import { SUPPORT_CATEGORIES, type SupportCategory } from '../../types/employer.js';
import { ApiError } from '../../api/client.js';
import './employerBase.js';

// Ported from the prototype Matchday_Employer.html's support/help page (Slice 12): a static
// FAQ accordion, a request form that posts to Task 1's createSupportController, and a
// "My requests" list backed by Task 1's supportListController. Renders inside EmployerShell
// (App.tsx) which already provides the ".employer-app" CSS scope, so this intentionally does
// NOT re-wrap in ".employer-app" (same convention as EmployerNotifications.tsx).
const FAQS: { q: string; a: string }[] = [
  { q: 'How do I register my company for a drive?', a: 'Open a drive under Available Drives and use Register to submit your requirement. Once an admin approves it you can create slots, view candidates, and schedule interviews for that drive.' },
  { q: 'Why can’t I see candidate names?', a: 'Candidate identities are masked until the candidate grants your identity-reveal request. Shortlist a candidate, request a reveal, and their name and contact appear once they consent.' },
  { q: 'How do interview slots work?', a: 'For an approved drive you create your own interview slots on the drive’s event dates. Candidates book into them, and you schedule interviews against a booked, consent-granted candidate.' },
  { q: 'How do I make an offer?', a: 'Once a candidate has granted consent, open their card and record an offer (CTC, location, mode, joining date). The offer status flows into your pipeline board automatically.' },
  { q: 'What do the bell and reports show?', a: 'The notification bell surfaces async updates (registration approvals, consent responses, slot bookings). Reports show a derived hiring funnel and KPIs across your drives.' },
  { q: 'Something isn’t working — how do I get help?', a: 'Raise a request below: pick a category, describe the issue, and the Hiringhood team will action it. You’ll see it tracked under “My requests”.' },
];
const STATUS_CLASS: Record<string, string> = { Open: 'st-cr', 'In progress': 'st-inprog', Resolved: 'st-completed' };

export function EmployerSupport() {
  const list = useEmployerSupport();
  const create = useCreateSupportRequest();
  const [category, setCategory] = useState<SupportCategory>('More candidates');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'Low' | 'Normal' | 'High'>('Normal');
  const [err, setErr] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    if (!subject.trim() || !message.trim()) { setErr('Subject and details are required.'); return; }
    create.mutate({ category, subject: subject.trim(), message: message.trim(), priority }, {
      onSuccess: () => { setSubject(''); setMessage(''); setPriority('Normal'); setCategory('More candidates'); },
      onError: (e2) => setErr(e2 instanceof ApiError ? e2.message : e2 instanceof Error ? e2.message : 'Failed to submit your request'),
    });
  }

  const items = list.data?.items ?? [];
  return (
    <div className="page-wrap">
      <div className="dash-greet"><h2>Support center</h2><p>Find quick answers, or raise a request and the Hiringhood team will action it.</p></div>

      <div className="card">
        <div className="card-head"><h3>Frequently asked questions</h3></div>
        <div className="card-body">
          {FAQS.map((f) => (
            <details className="faq" key={f.q}>
              <summary>{f.q}<svg className="q-ic" viewBox="0 0 24 24" width="18" height="18"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg></summary>
              <div className="a">{f.a}</div>
            </details>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Raise a request</h3></div>
        <div className="card-body">
          <form className="sup-form-grid" onSubmit={submit}>
            <div className="sup-field">
              <label>Category</label>
              <select className="select" value={category} onChange={(e) => setCategory(e.target.value as SupportCategory)}>
                {SUPPORT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="sup-field">
              <label>Priority</label>
              <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as 'Low' | 'Normal' | 'High')}>
                <option value="Low">Low</option><option value="Normal">Normal</option><option value="High">High</option>
              </select>
            </div>
            <div className="sup-field wide">
              <label>Subject</label>
              <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" />
            </div>
            <div className="sup-field wide">
              <label>Details</label>
              <textarea className="input" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe your request" />
            </div>
            {err && <div className="sup-field wide" role="alert" style={{ color: '#b42318', fontSize: 13 }}>{err}</div>}
            <div className="sup-field wide">
              <button type="submit" className="btn btn-primary" disabled={create.isPending}>{create.isPending ? 'Submitting…' : 'Submit request'}</button>
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>My requests</h3></div>
        <div className="card-body">
          {list.isLoading ? <p className="hint">Loading…</p>
            : list.isError ? <p className="hint">Failed to load your requests.</p>
            : items.length === 0 ? <p className="hint">No requests yet — raise one above and it’ll show up here.</p>
            : items.map((t) => (
              <div className="ticket-row" key={t.id}>
                <div className="ticket-main">
                  <div className="ticket-ref">{t.ref} · {t.category}</div>
                  <div className="ticket-t">{t.subject}</div>
                  <div className="ticket-s">{t.message}</div>
                </div>
                <div className="ticket-meta">
                  <span className={`status-pill ${STATUS_CLASS[t.status] ?? ''}`}>{t.status}</span>
                  <span className="ticket-time">{formatRelativeTime(t.createdAt)}</span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
