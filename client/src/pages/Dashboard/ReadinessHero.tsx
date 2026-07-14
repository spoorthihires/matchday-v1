import type { DashboardOverview } from '../../types/dashboard.js';

// Ported from matchday-admin-app_23.html lines ~1143-1177.
const C = 351.8; // gauge circumference: 2π·56

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// nextMatchDay is a UTC-midnight ISO date (calendar day, not an instant), so
// format with UTC getters — Date#toDateString()/toLocaleString() use the
// local time zone and can roll the displayed day back by one depending on
// where the app runs.
function formatKickoff(iso: string): string {
  const d = new Date(iso);
  return `${WEEKDAY_SHORT[d.getUTCDay()]}, ${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// Decorative only — the DTO carries no per-pillar icon/color. `key` is a
// closed union (supply/demand/slots/evaluations), so this reproduces the
// prototype's fixed identity colors exactly (also reused for the matching
// KPI groups in KpiSection). The "pf" (pillar footnote) icon/tone follows
// the same fixed per-key pairing as the prototype (evaluations is always
// framed as a pending/attention item; the DTO's own caption text for that
// pillar is always phrased as "<n> pending", never a completion count).
const PILLAR_META: Record<
  DashboardOverview['readiness']['pillars'][number]['key'],
  { icon: string; color: string; pfIcon: string; pfColor: string; label: string }
> = {
  supply: { icon: 'ti-users', color: 'var(--teal)', pfIcon: 'ti-check', pfColor: 'var(--success)', label: 'Supply' },
  demand: { icon: 'ti-briefcase', color: 'var(--indigo)', pfIcon: 'ti-check', pfColor: 'var(--success)', label: 'Demand' },
  slots: { icon: 'ti-calendar-time', color: 'var(--violet)', pfIcon: 'ti-check', pfColor: 'var(--success)', label: 'Slots' },
  evaluations: { icon: 'ti-clipboard-check', color: 'var(--warn)', pfIcon: 'ti-alert-triangle', pfColor: 'var(--warn)', label: 'Evaluations' },
};

// Decorative only — derived from `verdict.tone`, not hardcoded.
const VERDICT_ICON: Record<DashboardOverview['readiness']['verdict']['tone'], string> = {
  ontrack: 'ti-circle-check',
  'at-risk': 'ti-alert-triangle',
  'off-track': 'ti-alert-octagon',
};

export function ReadinessHero({ readiness }: { readiness: DashboardOverview['readiness'] }) {
  const offset = (C * (1 - readiness.score / 100)).toFixed(1);
  const hours = String(readiness.countdown.hours).padStart(2, '0');

  return (
    <div className="hero">
      <div className="hero-left">
        <div className="q"><i className="ti ti-target-arrow" /> Readiness check</div>
        <h2>Are we ready for the next MatchDay?</h2>
        <div className="gauge-wrap">
          <div className="gauge">
            <svg width="132" height="132" viewBox="0 0 132 132">
              <circle cx="66" cy="66" r="56" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="12" />
              <circle
                cx="66"
                cy="66"
                r="56"
                fill="none"
                stroke="#fff"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={offset}
              />
            </svg>
            <div className="val"><span className="n mono">{readiness.score}</span><span className="u">of 100</span></div>
          </div>
          <div className="verdict">
            <span className="badge">
              <i className={`ti ${VERDICT_ICON[readiness.verdict.tone]}`} /> {readiness.verdict.label}
            </span>
          </div>
        </div>
        <div className="countdown">
          <div className="cd-box"><div className="n mono">{readiness.countdown.days}</div><div className="k">days</div></div>
          <div className="cd-box"><div className="n mono">{hours}</div><div className="k">hrs</div></div>
          <div className="cd-when">Kickoff<b>{formatKickoff(readiness.nextMatchDay)}</b></div>
        </div>
      </div>
      <div className="hero-right">
        <div className="hr-top"><h3>What&apos;s feeding the score</h3></div>
        <div className="pillars">
          {readiness.pillars.map((p) => {
            const meta = PILLAR_META[p.key];
            return (
              <div className="pillar" key={p.key}>
                <div className="ph"><i className={`ti ${meta.icon}`} style={{ color: meta.color }} /> {meta.label}</div>
                <div className="pn mono">{p.pct}<small>%</small></div>
                <div className="bar"><i style={{ width: `${p.pct}%`, background: meta.color }} /></div>
                <div className="pf"><i className={`ti ${meta.pfIcon}`} style={{ color: meta.pfColor }} /> {p.caption}</div>
              </div>
            );
          })}
        </div>
        {readiness.attention && (
          <div className="attn">
            <i className="ti ti-alert-triangle" />
            <div>{readiness.attention.message}</div>
          </div>
        )}
      </div>
    </div>
  );
}
