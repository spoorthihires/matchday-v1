import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './jobseekerLanding.css';

// Ported from the prototype MatchDay_Jobseeker_Landing_Page.html (repo root): the full
// public jobseeker marketing landing (nav, hero, why-MatchDay, events, streams, how-it-works
// timeline, the assessment, companies league table, success stories, FAQ, final CTA, footer).
// Mirrors the EmployerLanding.tsx public-page pattern (no auth gate, scoped wrapper class +
// its own scoped CSS import). Content is intentionally static — no data fetching — the
// prototype's illustrative copy/arrays (STREAMS, TESTS, COMPANIES, EVENTS, FAQS) are ported
// as in-file constants, same as the prototype's own inline <script> did.

interface StreamItem {
  name: string;
  tag: string;
  icon: () => ReactNode;
  total: number;
  week: number;
  level: string;
  status: 'open' | 'soon';
}

const STREAMS: StreamItem[] = [
  { name: 'Engineering', tag: 'Backend · platform · frontend', total: 214, week: 38, level: 'All levels', status: 'open',
    icon: () => (<><path d="M8 9l-3 3 3 3M16 9l3 3-3 3M13 6l-2 12" /></>) },
  { name: 'Product & design', tag: 'PM · UX · product design', total: 86, week: 17, level: 'All levels', status: 'open',
    icon: () => (<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 9h6v6H9z" /></>) },
  { name: 'Data & AI', tag: 'Analytics · ML · applied AI', total: 102, week: 24, level: 'All levels', status: 'open',
    icon: () => (<><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 4-5" /></>) },
  { name: 'Sales & revenue', tag: 'AE · SDR · partnerships', total: 67, week: 12, level: 'All levels', status: 'open',
    icon: () => (<><path d="M3 3v18h18" /><path d="M7 13l3 3 7-8" /></>) },
  { name: 'Marketing', tag: 'Growth · content · brand', total: 44, week: 9, level: 'All levels', status: 'open',
    icon: () => (<path d="M3 11l18-7-7 18-2.5-8z" />) },
  { name: 'Operations', tag: 'Ops · program · supply chain', total: 58, week: 11, level: 'All levels', status: 'open',
    icon: () => (<><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 00-2-1.2l-.3-2.5h-4l-.3 2.5a7 7 0 00-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 005 12" /></>) },
  { name: 'Finance', tag: 'FP&A · accounting · strategy', total: 33, week: 6, level: 'Lateral', status: 'open',
    icon: () => (<><path d="M4 4h16v16H4z" /><path d="M8 14l3-3 2 2 3-4" /></>) },
  { name: 'Customer & support', tag: 'CS · success · support', total: 29, week: 0, level: 'All levels', status: 'soon',
    icon: () => (<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />) },
];

interface EventItem { d: string; mo: string; title: string; sub: string; fmt: string; }
const EVENTS: EventItem[] = [
  { d: '16', mo: 'Jul', title: 'Software engineering', sub: 'Live technical round + system design', fmt: '90 min · remote' },
  { d: '23', mo: 'Jul', title: 'Product & UX design', sub: 'Portfolio review + timed exercise', fmt: '75 min · remote' },
  { d: '30', mo: 'Jul', title: 'Sales & revenue', sub: 'Roleplay pitch + case debrief', fmt: '60 min · remote' },
  { d: '06', mo: 'Aug', title: 'Data & applied AI', sub: 'Take-home review + pairing session', fmt: '90 min · remote' },
];

interface CoverItem { title: string; desc: string; }
const COVERS: CoverItem[] = [
  { title: 'Technical aptitude', desc: 'Role-relevant reasoning and fundamentals.' },
  { title: 'Applied skill', desc: 'A hands-on task graded on approach, not trivia.' },
  { title: 'Portfolio & projects', desc: 'Your real work and contribution, verified.' },
  { title: 'Communication', desc: 'Clarity and articulation, scored fairly.' },
  { title: 'Role fit', desc: 'Matched to the roles that suit your strengths.' },
  { title: 'Feedback, always', desc: 'A written summary you keep, matched or not.' },
];

interface CompanyItem { name: string; sector: string; focus: string; openRoles: number; status: 'week' | 'next'; }
const COMPANIES: CompanyItem[] = [
  { name: 'Arlo Systems', sector: 'Cloud infrastructure', focus: 'Engineering', openRoles: 28, status: 'week' },
  { name: 'Northloop Health', sector: 'Digital health', focus: 'Product & design', openRoles: 19, status: 'week' },
  { name: 'Vantage Data Co.', sector: 'Analytics platform', focus: 'Data & AI', openRoles: 16, status: 'week' },
  { name: 'Fielder Logistics', sector: 'Supply chain', focus: 'Operations', openRoles: 14, status: 'next' },
  { name: 'Marrow Finance', sector: 'Fintech', focus: 'Finance', openRoles: 11, status: 'next' },
];

interface TestimonialItem { q: string; nm: string; rl: string; c: string; }
const TESTS: TestimonialItem[] = [
  { q: 'I signed up on a Wednesday and had an offer from Arlo that Friday. One assessment covered three interviews I would normally have repeated.', nm: 'Jordan T.', rl: 'Backend engineer', c: '#2f4fe0' },
  { q: 'The portfolio review felt like an actual conversation, not a form. I knew by the weekend that Northloop wanted a second round.', nm: 'Rae M.', rl: 'Product designer', c: '#17a673' },
  { q: 'Even the event I did not win came with real feedback on where my case study was thin. I used it and matched two weeks later.', nm: 'Sam K.', rl: 'Data analyst', c: '#1b2e8c' },
];

interface FaqItem { q: string; a: string; }
const FAQS: FaqItem[] = [
  { q: 'Do I have to apply to each company separately?', a: "No. One assessment per event covers every company hiring in that stream that week — you're considered by all of them at once, from a single profile." },
  { q: "What happens if I'm not matched?", a: "You'll get specific written feedback on your assessment and can register for the next event in your stream — most streams run weekly, so you never wait long." },
  { q: 'Is MatchDay really free for jobseekers?', a: 'Yes. MatchDay is completely free for jobseekers. Companies pay to take part in events — you just create a profile and show up.' },
  { q: 'Can I register for more than one stream?', a: 'Yes, though each stream has its own assessment, so most jobseekers focus on the one or two that fit them best.' },
];

interface WedRailDay { key: number; dow: string; dnum: number; isWed: boolean; isPast: boolean; }
function getWeekRail(): WedRailDay[] {
  const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());
  const days: WedRailDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const isWed = d.getDay() === 3;
    const isPast = d < new Date(today.getFullYear(), today.getMonth(), today.getDate()) && !isWed;
    days.push({ key: i, dow: DOW[d.getDay()], dnum: d.getDate(), isWed, isPast });
  }
  return days;
}

function initials(name: string): string {
  return name.split(' ').map((w) => w[0] ?? '').join('');
}

export function JobseekerLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const weekRail = getWeekRail();
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="js-landing">
      {/* NAV */}
      <header className="nav">
        <div className="wrap nav-inner">
          <a className="brand" href="#top">
            <span className="logo-mark">
              <svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M4 7l8-4 8 4-8 4-8-4z" /><path d="M4 7v6l8 4 8-4V7" /></svg>
            </span>
            <span>Hiringhood<small>MatchDay</small></span>
          </a>
          <nav className="nav-links">
            <a className="nav-link" href="#why">Why MatchDay</a>
            <a className="nav-link" href="#events">Events</a>
            <a className="nav-link" href="#streams">Streams</a>
            <a className="nav-link" href="#companies">Companies</a>
            <a className="nav-link" href="#faq">FAQ</a>
          </nav>
          <div className="nav-cta">
            <Link className="btn btn-ghost" to="/login">Log in</Link>
            <Link className="btn btn-primary" to="/jobseekers/signup">Join free</Link>
            <button className="nav-burger" aria-label="Menu" onClick={() => setMenuOpen((open) => !open)}>
              <svg className="ic ic-lg" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          </div>
        </div>
      </header>
      <div className={menuOpen ? 'mobile-menu open' : 'mobile-menu'}>
        <a href="#why" onClick={closeMenu}>Why MatchDay</a>
        <a href="#events" onClick={closeMenu}>Events</a>
        <a href="#streams" onClick={closeMenu}>Streams</a>
        <a href="#companies" onClick={closeMenu}>Companies</a>
        <a href="#faq" onClick={closeMenu}>FAQ</a>
        <Link className="btn btn-ghost btn-block" to="/login" onClick={closeMenu}>Log in</Link>
        <Link className="btn btn-primary btn-block" to="/jobseekers/signup" onClick={closeMenu}>Join free</Link>
      </div>

      {/* HERO */}
      <section className="hero" style={{ paddingBottom: 0 }}>
        <div className="hero-grid-bg" />
        <div className="wrap hero-inner">
          <div>
            <span className="eyebrow"><span className="dot" /> Every Wednesday · Free for jobseekers</span>
            <h1 className="hero-title">Your next job, matched in <span className="accent">one week</span>.</h1>
            <p className="hero-sub">
              MatchDay is a free weekly hiring event for jobseekers. Build one profile, take a single
              assessment, and get matched to every company hiring in your field that Wednesday — no cold
              applications, no ghosting.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary btn-lg" to="/jobseekers/signup">
                Join free
                <svg className="ic" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
              <a className="btn btn-ghost btn-lg" href="#streams">Explore streams</a>
              <a className="link-demo" href="#events">
                <svg className="ic" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                See this week&rsquo;s events
              </a>
            </div>
            <div className="hero-stats">
              <div className="stat"><div className="n">1<span className="sm">profile</span></div><div className="l">seen by every hiring company</div></div>
              <div className="stat"><div className="n">7<span className="sm">-day</span></div><div className="l">sign-up to offer</div></div>
              <div className="stat"><div className="n">Free<span className="sm" /></div><div className="l">for jobseekers, always</div></div>
            </div>
          </div>

          {/* Hero card: this week's events */}
          <div className="hero-card">
            <div className="hc-head">
              <span className="t">This week&rsquo;s events</span>
              <span className="badge-open">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'block' }} />
                Registration open
              </span>
            </div>
            <div className="wed-rail">
              {weekRail.map((d) => (
                <div key={d.key} className={`wed-day${d.isWed ? ' is-wed' : ''}${d.isPast ? ' is-past' : ''}`}>
                  <div className="dow">{d.dow}</div>
                  <div className="dnum">{d.dnum}</div>
                </div>
              ))}
            </div>
            <div className="hc-drive">
              <div className="hcd-top">
                <span className="hcd-ic"><svg className="ic" viewBox="0 0 24 24"><path d="M8 9l-3 3 3 3M16 9l3 3-3 3M13 6l-2 12" /></svg></span>
                <div><div className="hcd-name">Software engineering</div><div className="hcd-meta">Wed · remote · 90 min</div></div>
                <div className="hcd-pool"><div className="n">214</div><div className="l">open roles</div></div>
              </div>
              <div className="hcd-bar"><i style={{ width: '64%' }} /></div>
              <div className="hcd-legend"><span>Registered <b>128</b></span><span>Spots left <b>31</b></span></div>
            </div>
            <div className="hc-drive">
              <div className="hcd-top">
                <span className="hcd-ic"><svg className="ic" viewBox="0 0 24 24"><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 4-5" /></svg></span>
                <div><div className="hcd-name">Data &amp; applied AI</div><div className="hcd-meta">Wed · remote · 90 min</div></div>
                <div className="hcd-pool"><div className="n">102</div><div className="l">open roles</div></div>
              </div>
              <div className="hcd-bar"><i style={{ width: '78%' }} /></div>
              <div className="hcd-legend"><span>Registered <b>96</b></span><span>Spots left <b>12</b></span></div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY MATCHDAY */}
      <section id="why">
        <div className="wrap what-grid">
          <div>
            <div className="sec-head" style={{ marginBottom: 28 }}>
              <div className="kicker">Why MatchDay</div>
              <h2 className="sec-title">A hiring event built around you — not a job board.</h2>
              <p className="sec-lead">
                Instead of firing r&eacute;sum&eacute;s into the void, you take one assessment and get
                matched to every company hiring in your field that week. No repeating the same test, and no silent queue.
              </p>
            </div>
            <div className="what-list">
              <div className="what-item">
                <span className="what-ic"><svg className="ic" viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><circle cx="12" cy="12" r="4" /></svg></span>
                <div><h4>One profile, every employer</h4><p>Build your profile once and get considered by every company hiring in your field that week.</p></div>
              </div>
              <div className="what-item">
                <span className="what-ic"><svg className="ic" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg></span>
                <div><h4>An answer, either way</h4><p>Every event ends with a decision — matched, shortlisted, or a clear line-up for the next one. No ghosting.</p></div>
              </div>
              <div className="what-item">
                <span className="what-ic"><svg className="ic" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /></svg></span>
                <div><h4>Companies show up too</h4><p>Hiring managers commit to the same window, so your profile lands in front of someone actively reviewing.</p></div>
              </div>
              <div className="what-item">
                <span className="what-ic"><svg className="ic" viewBox="0 0 24 24"><path d="M12 22s-7-4.35-7-11a7 7 0 0114 0c0 6.65-7 11-7 11z" /><circle cx="12" cy="11" r="2.5" /></svg></span>
                <div><h4>Free for jobseekers, always</h4><p>MatchDay is free to join. Companies pay to take part — you just show up and perform.</p></div>
              </div>
            </div>
          </div>
          <div className="what-quote">
            <div className="mark">&ldquo;</div>
            <p>Build one profile, take one assessment, and meet every company hiring in your field that week — matched, not ghosted.</p>
            <div className="by">— The MatchDay promise to jobseekers</div>
          </div>
        </div>
      </section>

      {/* EVENTS */}
      <section id="events" className="bg-wash">
        <div className="wrap">
          <div className="sec-head">
            <div className="kicker">This month</div>
            <h2 className="sec-title">Upcoming hiring events.</h2>
            <p className="sec-lead">Every Wednesday a new event opens for a set of streams. Register before it starts to hold your spot.</p>
          </div>
          <div className="fx-list">
            {EVENTS.map((e) => (
              <div className="fx" key={`${e.mo}-${e.d}-${e.title}`}>
                <div className="fx-date"><span className="d">{e.d}</span><span className="mo">{e.mo}</span></div>
                <div><div className="fx-title">{e.title}</div><div className="fx-sub">{e.sub}</div></div>
                <span className="fx-fmt">{e.fmt}</span>
                <Link className="btn btn-ghost" to="/jobseekers/signup">Register</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STREAMS */}
      <section id="streams">
        <div className="wrap">
          <div className="sec-head">
            <div className="kicker">Pick your stream</div>
            <h2 className="sec-title">Choose the stream that fits you.</h2>
            <p className="sec-lead">Each stream runs its own events, assessment, and pool of hiring companies — built around how your discipline actually gets hired. Numbers refresh ahead of every Wednesday.</p>
          </div>
          <div className="stream-grid">
            {STREAMS.map((s) => (
              <div className="stream" key={s.name}>
                <div className="stream-ic"><svg className="ic ic-lg" viewBox="0 0 24 24">{s.icon()}</svg></div>
                <h3>{s.name}</h3>
                <div className="tag">{s.tag}</div>
                <div className="stream-nums">
                  <div className="k"><div className="n">{s.total}</div><div className="l">open roles</div></div>
                  <div className="k"><div className="n">{s.status === 'soon' ? '—' : s.week}</div><div className="l">this week</div></div>
                </div>
                <div className="stream-foot">
                  <span className={`pill ${s.status === 'open' ? 'pill-open' : 'pill-soon'}`}>
                    {s.status === 'open'
                      ? <><svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg> Open</>
                      : <><svg className="ic ic-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg> Coming soon</>}
                  </span>
                  <span className="lvl">{s.level}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-ink">
        <div className="wrap">
          <div className="sec-head center">
            <div className="kicker">How it works</div>
            <h2 className="sec-title">One week, from sign-up to offer.</h2>
            <p className="sec-lead">MatchDay runs on a predictable weekly rhythm, so you always know what happens next.</p>
          </div>
          <div className="timeline">
            <div className="tl-line"><i /></div>
            <div className="tl-step hl"><div className="tl-node">1</div><h5>Sign up</h5><p>Pick a stream and reserve your spot</p></div>
            <div className="tl-step"><div className="tl-node">2</div><h5>Assess</h5><p>One timed, stream-specific evaluation</p></div>
            <div className="tl-step"><div className="tl-node">W</div><h5>MatchDay</h5><p>Companies review your result, Wednesday</p></div>
            <div className="tl-step"><div className="tl-node">3</div><h5>Shortlist</h5><p>Interested companies shortlist you</p></div>
            <div className="tl-step"><div className="tl-node">4</div><h5>Offer</h5><p>Match, interview, and an offer</p></div>
          </div>
        </div>
      </section>

      {/* THE ASSESSMENT */}
      <section id="process">
        <div className="wrap">
          <div className="sec-head center">
            <div className="kicker">The assessment</div>
            <h2 className="sec-title">One assessment, seen by every company.</h2>
            <p className="sec-lead">You complete a single stream assessment. Here&rsquo;s what it shows companies — so you&rsquo;re interviewed for judgement, not basics.</p>
          </div>
          <div className="cover-grid">
            {COVERS.map((c) => (
              <div className="cover" key={c.title}>
                <span className="ck"><svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg></span>
                <div><h4>{c.title}</h4><p>{c.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPANIES */}
      <section id="companies" className="bg-wash">
        <div className="wrap">
          <div className="sec-head">
            <div className="kicker">Who&rsquo;s hiring</div>
            <h2 className="sec-title">Companies hiring through MatchDay.</h2>
            <p className="sec-lead">A running list of the organizations running events this month — so you can see who you could be matched with.</p>
          </div>
          <table className="league">
            <thead><tr><th>#</th><th>Company</th><th>Stream focus</th><th>Open roles</th><th>Status</th></tr></thead>
            <tbody>
              {COMPANIES.map((c, i) => (
                <tr key={c.name}>
                  <td>{i + 1}</td>
                  <td><div className="emp-name">{c.name}</div><div className="emp-sector">{c.sector}</div></td>
                  <td>{c.focus}</td>
                  <td className="open-n">{c.openRoles}</td>
                  <td><span className={`badge ${c.status === 'week' ? 'wk' : 'nx'}`}>{c.status === 'week' ? 'Hiring this week' : 'Next event'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* SUCCESS STORIES */}
      <section>
        <div className="wrap">
          <div className="sec-head center">
            <div className="kicker">Success stories</div>
            <h2 className="sec-title">Jobseekers who got hired through MatchDay.</h2>
          </div>
          <div className="test-grid">
            {TESTS.map((t) => (
              <div className="test" key={t.nm}>
                <div className="stars">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <svg key={i} className="ic ic-sm" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                      <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7L12 17.8 5.7 21.5l1.7-7L2 9.8l7.1-.6z" />
                    </svg>
                  ))}
                </div>
                <p>{t.q}</p>
                <div className="who">
                  <div className="avatar" style={{ background: t.c }}>{initials(t.nm)}</div>
                  <div><div className="nm">{t.nm}</div><div className="rl">{t.rl}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-wash">
        <div className="wrap">
          <div className="sec-head center">
            <div className="kicker">FAQs</div>
            <h2 className="sec-title">Answers before you join.</h2>
          </div>
          <div className="faq-wrap">
            {FAQS.map((f) => (
              <details className="faq" key={f.q}>
                <summary>{f.q}<svg className="ic q-ic" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></summary>
                <div className="a">{f.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="cta-band">
            <div className="wed-mini"><span>M</span><span>T</span><span className="on">W</span><span>T</span><span>F</span></div>
            <h2>Find your next role this Wednesday.</h2>
            <p>Join free, pick your stream, and get matched to every company hiring that week — ready to interview, not lost in a pile of applications.</p>
            <div className="actions">
              <Link className="btn btn-white btn-lg" to="/jobseekers/signup">Join free</Link>
              <a className="btn btn-outline-white btn-lg" href="#streams">Explore streams</a>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-brand">
              <a className="brand" href="#top">
                <span className="logo-mark"><svg className="ic ic-sm" viewBox="0 0 24 24"><path d="M4 7l8-4 8 4-8 4-8-4z" /><path d="M4 7v6l8 4 8-4V7" /></svg></span>
                <span>Hiringhood<small>MatchDay</small></span>
              </a>
              <p>A free weekly hiring event for jobseekers. Build one profile, get assessed once, and get matched to every company hiring in your field that Wednesday.</p>
            </div>
            <div className="foot-col">
              <h5>Jobseekers</h5>
              <Link to="/jobseekers/signup">Join free</Link>
              <a href="#streams">Streams</a>
              <a href="#events">Events</a>
              <a href="#faq">FAQ</a>
            </div>
            <div className="foot-col">
              <h5>Companies</h5>
              <a href="#companies">Who&rsquo;s hiring</a>
              <a href="#">For employers</a>
              <a href="#">Pricing</a>
            </div>
            <div className="foot-col">
              <h5>Company</h5>
              <a href="#">About Hiringhood</a>
              <a href="#">Contact</a>
              <a href="#">Privacy</a>
              <a href="#">Terms</a>
            </div>
          </div>
          <div className="foot-bar">
            <span>&copy; 2026 Hiringhood. All rights reserved.</span>
            <span className="r"><a href="#">Privacy</a><a href="#">Terms</a><a href="#">Cookies</a></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
