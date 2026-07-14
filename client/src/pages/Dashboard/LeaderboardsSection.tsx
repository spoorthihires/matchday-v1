import type { DashboardOverview } from '../../types/dashboard.js';

// Ported from matchday-admin-app_23.html lines ~1305-1334.

function rankClass(rank: number): string {
  return rank <= 3 ? `rank g${rank}` : 'rank';
}

// Decorative only — the DTO carries no avatar initials/color. Derived from
// `name` (not literal per-org values — the seeded institute/employer names
// differ from the prototype's demo companies, so there's nothing to match
// verbatim; this reproduces the *look*, per the task's explicit allowance).
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const AVATAR_PALETTE = ['var(--indigo)', 'var(--teal)', 'var(--violet)', 'var(--amber)', 'var(--danger)'];
function avatarColor(rank: number): string {
  return AVATAR_PALETTE[(rank - 1) % AVATAR_PALETTE.length];
}

// Decorative only — the DTO gives a single current-cycle rate, not a
// previous-period comparison, so there's no real "trend" to report. This
// derives up/dn relative to the peer average within the same board (the
// class pair is mandated by the port), rather than inventing an absolute
// threshold or a fabricated historical delta.
function trendClass(value: number, all: number[]): string {
  const avg = all.reduce((sum, v) => sum + v, 0) / (all.length || 1);
  return value >= avg ? 'trend-up' : 'trend-dn';
}

export function LeaderboardsSection({ leaderboards }: { leaderboards: DashboardOverview['leaderboards'] }) {
  const instConversions = leaderboards.institutes.map((r) => r.conversionPct);
  const empFillRates = leaderboards.employers.map((r) => r.fillRatePct);

  return (
    <>
      <div className="section-title">Leaderboards <span className="rule" /></div>
      <div className="grid-2b">
        <div className="card">
          <div className="card-h">
            <div><h3>Institute Leaderboard</h3><div className="sub">By match-ready candidates supplied</div></div>
          </div>
          <div className="lb">
            <table>
              <thead>
                <tr><th style={{ width: 36 }} /><th>Institute</th><th className="r">Ready</th><th className="r">Conversion</th></tr>
              </thead>
              <tbody>
                {leaderboards.institutes.map((r) => (
                  <tr key={r.rank}>
                    <td><span className={rankClass(r.rank)}>{r.rank}</span></td>
                    <td>
                      <div className="org">
                        <span className="lo" style={{ background: avatarColor(r.rank) }}>{initials(r.name)}</span>
                        <div><b>{r.name}</b><span>{r.city}</span></div>
                      </div>
                    </td>
                    <td className="r"><b className="mono">{r.ready}</b></td>
                    <td className="r">
                      <span className="mini"><i style={{ width: `${r.conversionPct}%` }} /></span>{' '}
                      <span className={trendClass(r.conversionPct, instConversions)}>{r.conversionPct}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-h">
            <div><h3>Employer Leaderboard</h3><div className="sub">By offers extended this cycle</div></div>
          </div>
          <div className="lb">
            <table>
              <thead>
                <tr><th style={{ width: 36 }} /><th>Employer</th><th className="r">Offers</th><th className="r">Fill rate</th></tr>
              </thead>
              <tbody>
                {leaderboards.employers.map((r) => (
                  <tr key={r.rank}>
                    <td><span className={rankClass(r.rank)}>{r.rank}</span></td>
                    <td>
                      <div className="org">
                        <span className="lo" style={{ background: avatarColor(r.rank) }}>{initials(r.name)}</span>
                        <div><b>{r.name}</b><span>{r.industry}</span></div>
                      </div>
                    </td>
                    <td className="r"><b className="mono">{r.offers}</b></td>
                    <td className="r">
                      <span className="mini"><i style={{ width: `${r.fillRatePct}%` }} /></span>{' '}
                      <span className={trendClass(r.fillRatePct, empFillRates)}>{r.fillRatePct}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
