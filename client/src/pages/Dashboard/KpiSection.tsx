import { useState } from 'react';
import type { DashboardOverview } from '../../types/dashboard.js';

// Ported from matchday-admin-app_23.html lines ~1179-1227.

// Decorative only — the DTO carries no per-KPI icon. `key` is a stable,
// server-defined enum (server/src/modules/dashboard/dashboard.service.ts),
// so this reproduces the prototype's exact per-metric icon/color pairing.
// Any future/unknown key falls back to a per-group color family.
const KPI_ICON: Record<string, { icon: string; tone: string }> = {
  activeDrives: { icon: 'ti-calendar-event', tone: 'i-indigo' },
  upcomingWednesdays: { icon: 'ti-calendar-star', tone: 'i-violet' },
  employerRegistrations: { icon: 'ti-briefcase', tone: 'i-indigo' },
  instituteParticipation: { icon: 'ti-building-community', tone: 'i-teal' },
  jobseekersAdded: { icon: 'ti-user-plus', tone: 'i-teal' },
  profilesCompleted: { icon: 'ti-id-badge-2', tone: 'i-teal' },
  evaluationsCompleted: { icon: 'ti-clipboard-check', tone: 'i-amber' },
  matchReady: { icon: 'ti-user-check', tone: 'i-green' },
  slotsBooked: { icon: 'ti-calendar-check', tone: 'i-violet' },
  slotsAvailable: { icon: 'ti-calendar-plus', tone: 'i-indigo' },
  shortlisted: { icon: 'ti-list-check', tone: 'i-green' },
  offersSent: { icon: 'ti-send', tone: 'i-green' },
  joined: { icon: 'ti-confetti', tone: 'i-green' },
  dropOffRate: { icon: 'ti-user-off', tone: 'i-red' },
};

const GROUP_FALLBACK_ICON: Record<string, { icon: string; tone: string }> = {
  Demand: { icon: 'ti-briefcase', tone: 'i-indigo' },
  Schedule: { icon: 'ti-calendar-star', tone: 'i-violet' },
  Supply: { icon: 'ti-users', tone: 'i-teal' },
  Slots: { icon: 'ti-calendar-time', tone: 'i-violet' },
  Outcomes: { icon: 'ti-flag', tone: 'i-green' },
};

function kpiIcon(k: { key: string; group: string }): { icon: string; tone: string } {
  return KPI_ICON[k.key] ?? GROUP_FALLBACK_ICON[k.group] ?? { icon: 'ti-chart-bar', tone: 'i-indigo' };
}

const DELTA_ICON: Record<'up' | 'down' | 'flat', string> = {
  up: 'ti-trending-up',
  down: 'ti-trending-down',
  flat: 'ti-minus',
};

export function KpiSection({ kpis }: { kpis: DashboardOverview['kpis'] }) {
  const [view, setView] = useState<'table' | 'cards'>('table');
  return (
    <>
      <div className="section-title">
        Key metrics <span className="rule" />
        <span style={{ textTransform: 'none', fontWeight: 500, color: 'var(--faint)' }}>vs previous 30 days</span>
        <span className="seg" role="tablist" aria-label="Metrics view">
          <button
            className={view === 'table' ? 'on' : ''}
            aria-pressed={view === 'table'}
            onClick={() => setView('table')}
          >
            <i className="ti ti-table" /> Table
          </button>
          <button
            className={view === 'cards' ? 'on' : ''}
            aria-pressed={view === 'cards'}
            onClick={() => setView('cards')}
          >
            <i className="ti ti-layout-grid" /> Cards
          </button>
        </span>
      </div>

      {view === 'table' ? (
        <div className="mtable">
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th className="r">Value</th>
                <th className="r">Change (30d)</th>
                <th className="colgrp">Group</th>
              </tr>
            </thead>
            <tbody>
              {kpis.map((k) => {
                const { icon, tone } = kpiIcon(k);
                return (
                  <tr key={k.key}>
                    <td>
                      <div className="mname">
                        <span className={`ic ${tone}`}><i className={`ti ${icon}`} /></span> {k.label}
                      </div>
                    </td>
                    <td className="r"><span className="mval">{k.display}</span></td>
                    <td className="r">
                      <span className={`mchg ${k.delta.direction}`}>
                        <i className={`ti ${DELTA_ICON[k.delta.direction]}`} /> {k.delta.display}
                      </span>
                    </td>
                    <td className="colgrp"><span className="grp">{k.group}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="kpis">
          {kpis.map((k) => {
            const { icon, tone } = kpiIcon(k);
            return (
              <div className="kpi" key={k.key}>
                <div className="kh"><span className={`ic ${tone}`}><i className={`ti ${icon}`} /></span> {k.label}</div>
                <div className="kv mono">{k.display}</div>
                <div className={`kd ${k.delta.direction}`}>
                  <i className={`ti ${DELTA_ICON[k.delta.direction]}`} /> {k.delta.display}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
