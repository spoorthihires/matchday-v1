import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../../../components/AppShell.js';
import { useInstitute } from '../hooks/useInstitute.js';
import { AssignDrivesModal } from './AssignDrivesModal.js';
import { TabAudit } from './TabAudit.js';
import { TabCandidates } from './TabCandidates.js';
import { TabDrives } from './TabDrives.js';
import { TabFunnel } from './TabFunnel.js';
import { TabOverview } from './TabOverview.js';
import { TabOwnership } from './TabOwnership.js';
import { TabPerformance } from './TabPerformance.js';

// Ported from matchday-admin-app_23.html lines 1587-1630 (#page-institute-detail) and the
// renderInstituteDetail()/openInstituteDetail() handlers around lines 3852-3868.
//
// Self-wraps in AppShell (mirroring InstitutesPage/DrivesPage) — App.tsx must mount this
// directly under ProtectedRoute with no outer AppShell of its own (exactly one AppShell in the
// render tree).

type TabKey = 'overview' | 'candidates' | 'drives' | 'funnel' | 'performance' | 'ownership' | 'audit';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'ti-layout-dashboard' },
  { key: 'candidates', label: 'Candidates', icon: 'ti-users' },
  { key: 'drives', label: 'Drives', icon: 'ti-calendar-event' },
  { key: 'funnel', label: 'Funnel Analytics', icon: 'ti-filter' },
  { key: 'performance', label: 'Performance', icon: 'ti-chart-bar' },
  { key: 'ownership', label: 'Ownership History', icon: 'ti-history' },
  { key: 'audit', label: 'Audit Logs', icon: 'ti-list-details' },
];

// stCls from the prototype (line 3865) — same map as InstitutesTable.tsx's STATUS_CLASS
// (verified against theme.css: Active→st-active, Pending→st-pending, Disabled→st-archived;
// there is no dedicated st-disabled class).
const STATUS_CLASS: Record<string, string> = {
  Active: 'st-active',
  Pending: 'st-pending',
  Disabled: 'st-archived',
};

// iColors from the prototype (line 3677), same stable-hash approach as InstitutesTable.tsx's
// colorForId (real ids are Mongo ObjectIds, not the prototype's small integers).
const LOGO_COLORS = ['#2f4fe0', '#0aa3a3', '#7c5cff', '#f2a63b', '#d9314b', '#0f9d58'];

function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return LOGO_COLORS[h % LOGO_COLORS.length];
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export function InstituteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [assignOpen, setAssignOpen] = useState(false);
  const { data, isLoading, isError, error } = useInstitute(id);

  if (isLoading) {
    return (
      <AppShell crumb="Supply · Institutes" title="Institute">
        <div className="content">
          <div className="card"><p style={{ padding: 20, color: 'var(--muted)' }}>Loading institute…</p></div>
        </div>
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell crumb="Supply · Institutes" title="Institute">
        <div className="content">
          <div className="card">
            <p style={{ padding: 20, color: 'var(--danger)' }}>
              Failed to load institute: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  const { institute, funnel, kpis, performance, assignedDrives } = data;

  return (
    <AppShell crumb="Supply · Institutes" title={institute.name}>
      <div className="content">
        <button className="backlink" onClick={() => navigate('/institutes')}>
          <i className="ti ti-arrow-left" /> Back to Institutes
        </button>

        <div className="idhead">
          <span className="biglogo" style={{ background: colorForId(institute._id) }}>
            {initials(institute.name)}
          </span>
          <div className="idmeta">
            <h2>
              <span>{institute.name}</span>{' '}
              <span className={`badge-st ${STATUS_CLASS[institute.status] ?? 'st-pending'}`}>
                <i className="ti ti-circle-filled" /> {institute.status}
              </span>
            </h2>
            <div className="subrow">
              <span><i className="ti ti-category" /> {institute.type}</span>
              <span><i className="ti ti-map-pin" /> {institute.city}</span>
              <span><i className="ti ti-user" /> {institute.owner}</span>
              <span><i className="ti ti-mail" /> {institute.email}</span>
              <span><i className="ti ti-calendar-event" /> {assignedDrives} drive{assignedDrives === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div className="idactions">
            <button className="btn btn-ghost" onClick={() => setAssignOpen(true)}>
              <i className="ti ti-calendar-plus" /> Assign Drives
            </button>
            <button className="btn btn-ghost" disabled title="Coming soon">
              <i className="ti ti-upload" /> Upload
            </button>
            {/* Simplest faithful action for this task: send the user back to the list, where the
                existing edit modal (InstituteModal, wired in Institutes/index.tsx) already
                handles editing. A dedicated inline editor on this page is out of scope here. */}
            <button className="btn btn-primary" onClick={() => navigate('/institutes')}>
              <i className="ti ti-edit" /> Edit
            </button>
          </div>
        </div>

        <div className="kpis" style={{ marginTop: 16 }}>
          <div className="kpi">
            <div className="kh"><span className="ic i-teal"><i className="ti ti-user-plus" /></span> Candidates Uploaded</div>
            <div className="kv mono">{kpis.uploaded.toLocaleString('en-IN')}</div>
            <div className="kd flat"><i className="ti ti-minus" /> total</div>
          </div>
          <div className="kpi">
            <div className="kh"><span className="ic i-green"><i className="ti ti-user-check" /></span> Match-Ready</div>
            <div className="kv mono">
              {Math.round((kpis.uploaded * kpis.matchReadyPct) / 100)} <small>/ {kpis.matchReadyPct}%</small>
            </div>
            <div className="kd up"><i className="ti ti-trending-up" /> qualified</div>
          </div>
          <div className="kpi">
            <div className="kh"><span className="ic i-indigo"><i className="ti ti-list-check" /></span> Shortlisted</div>
            <div className="kv mono">
              {Math.round((kpis.uploaded * kpis.shortlistPct) / 100)} <small>/ {kpis.shortlistPct}%</small>
            </div>
            <div className="kd flat"><i className="ti ti-minus" /></div>
          </div>
          <div className="kpi">
            <div className="kh"><span className="ic i-green"><i className="ti ti-confetti" /></span> Joined</div>
            <div className="kv mono">
              {Math.round((kpis.uploaded * kpis.joinedPct) / 100)} <small>/ {kpis.joinedPct}%</small>
            </div>
            <div className="kd up"><i className="ti ti-trending-up" /></div>
          </div>
        </div>

        <div className="tabbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={activeTab === t.key ? 'on' : undefined}
              onClick={() => setActiveTab(t.key)}
            >
              <i className={`ti ${t.icon}`} /> {t.label}
            </button>
          ))}
        </div>

        <div className="tabpane on">
          {activeTab === 'overview' && (
            <TabOverview institute={institute} funnel={funnel} onOpenFunnel={() => setActiveTab('funnel')} />
          )}
          {activeTab === 'candidates' && <TabCandidates instituteId={institute._id} />}
          {activeTab === 'drives' && <TabDrives instituteId={institute._id} />}
          {activeTab === 'funnel' && <TabFunnel funnel={funnel} instituteName={institute.name} />}
          {activeTab === 'performance' && <TabPerformance performance={performance} />}
          {activeTab === 'ownership' && <TabOwnership ownershipHistory={institute.ownershipHistory} />}
          {activeTab === 'audit' && <TabAudit instituteId={institute._id} />}
        </div>

        {assignOpen && <AssignDrivesModal instituteId={institute._id} onClose={() => setAssignOpen(false)} />}
      </div>
    </AppShell>
  );
}
