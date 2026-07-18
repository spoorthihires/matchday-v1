import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../../components/AppShell.js';
import {
  INITIAL_CANDIDATE_OWNERSHIP, INITIAL_CONFLICTS, INITIAL_INSTITUTE_OWNERSHIP, SOURCE_ATTRIBUTION,
} from './mockData.js';
import { TabCandidateOwnership } from './TabCandidateOwnership.js';
import { TabConflicts } from './TabConflicts.js';
import { TabInstituteOwnership } from './TabInstituteOwnership.js';
import { TabSourceAttribution } from './TabSourceAttribution.js';

// New page, not ported from the prototype (matchday-admin-app_23.html has no equivalent — it
// only has a per-institute "Ownership History" tab, see InstitutesPage/detail/TabOwnership.tsx).
// UI-only per the task brief: every row here is static mock data (mockData.ts) held in this
// page's state and passed down to each tab; there is no `/api/ownership` module. Shell mirrors
// InstituteDetail.tsx's header + KPI row + tabbar/tabpane structure for visual consistency.

type TabKey = 'candidates' | 'institutes' | 'source' | 'conflicts';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'candidates', label: 'Candidate Ownership', icon: 'ti-user-check' },
  { key: 'institutes', label: 'Institute Ownership', icon: 'ti-building-community' },
  { key: 'source', label: 'Source Attribution', icon: 'ti-chart-donut' },
  { key: 'conflicts', label: 'Conflicts', icon: 'ti-alert-triangle' },
];

export function OwnershipManagementPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('candidates');
  const [candidateRows, setCandidateRows] = useState(INITIAL_CANDIDATE_OWNERSHIP);
  const [instituteRows, setInstituteRows] = useState(INITIAL_INSTITUTE_OWNERSHIP);
  const [conflictRows, setConflictRows] = useState(INITIAL_CONFLICTS);

  const unassignedCandidates = candidateRows.filter((r) => r.status === 'Unassigned').length;
  const openConflicts = conflictRows.filter((r) => r.status === 'Open').length;

  return (
    <AppShell crumb="Supply · Institutes" title="Ownership Management">
      <div className="content">
        <button className="backlink" onClick={() => navigate('/institutes')}>
          <i className="ti ti-arrow-left" /> Back to Institutes
        </button>

        <div className="kpis" style={{ marginTop: 16 }}>
          <div className="kpi">
            <div className="kh"><span className="ic i-indigo"><i className="ti ti-users-group" /></span> Candidates Owned</div>
            <div className="kv mono">{candidateRows.length}</div>
            <div className="kd flat"><i className="ti ti-minus" /> tracked</div>
          </div>
          <div className="kpi">
            <div className="kh"><span className="ic i-amber"><i className="ti ti-user-question" /></span> Unassigned Candidates</div>
            <div className="kv mono">{unassignedCandidates}</div>
            <div className="kd flat"><i className="ti ti-alert-circle" /> needs an owner</div>
          </div>
          <div className="kpi">
            <div className="kh"><span className="ic i-teal"><i className="ti ti-building-community" /></span> Institutes with Owners</div>
            <div className="kv mono">{instituteRows.length}</div>
            <div className="kd flat"><i className="ti ti-minus" /> assigned SPOCs</div>
          </div>
          <div className="kpi">
            <div className="kh"><span className="ic i-red"><i className="ti ti-alert-triangle" /></span> Open Conflicts</div>
            <div className="kv mono">{openConflicts}</div>
            <div className="kd down"><i className="ti ti-flag" /> needs review</div>
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
          {activeTab === 'candidates' && <TabCandidateOwnership rows={candidateRows} onChange={setCandidateRows} />}
          {activeTab === 'institutes' && <TabInstituteOwnership rows={instituteRows} onChange={setInstituteRows} />}
          {activeTab === 'source' && <TabSourceAttribution rows={SOURCE_ATTRIBUTION} />}
          {activeTab === 'conflicts' && <TabConflicts rows={conflictRows} onChange={setConflictRows} />}
        </div>
      </div>
    </AppShell>
  );
}
