import { Link, useNavigate } from 'react-router-dom';
import './employerBase.js';

// Ported (minimal) from the prototype Matchday_Employer.html lines ~1869-2223: brand nav +
// hero only. The marketing sections (what-is-MatchDay, streams, process, pricing,
// testimonials, faq, final CTA, footer) are intentionally not ported for this slice.
export function EmployerLanding() {
  const navigate = useNavigate();

  return (
    <div className="employer-app">
      <header className="nav">
        <div className="wrap nav-inner">
          <Link className="brand" to="/employer">
            <span className="logo-mark">
              <svg className="ic ic-sm" viewBox="0 0 24 24">
                <path d="M4 7l8-4 8 4-8 4-8-4z" />
                <path d="M4 7v6l8 4 8-4V7" />
              </svg>
            </span>
            <span>Hiringhood<small>MatchDay</small></span>
          </Link>
          <div className="nav-cta">
            <button className="btn btn-ghost" onClick={() => navigate('/employer/login')}>Log in</button>
            <button className="btn btn-primary" onClick={() => navigate('/employer/signup')}>Employer sign up</button>
          </div>
        </div>
      </header>

      <section className="hero" style={{ paddingBottom: 0 }}>
        <div className="hero-grid-bg" />
        <div className="wrap hero-inner">
          <div>
            <span className="eyebrow"><span className="dot" /> Every Wednesday · AI/ML &amp; Data hiring</span>
            <h1 className="hero-title">Hire <span className="accent">pre-evaluated</span> AI/ML talent, every Wednesday.</h1>
            <p className="hero-sub">
              MatchDay is Hiringhood&rsquo;s weekly hiring event. Register a role, book a Wednesday slot, and review
              candidates who&rsquo;ve already cleared aptitude, coding, and a TARA interview &mdash; ready to
              interview, not just to screen.
            </p>
            <div className="hero-actions">
              <button className="btn btn-primary btn-lg" onClick={() => navigate('/employer/signup')}>
                Employer sign up
                <svg className="ic" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
              <button className="btn btn-ghost btn-lg" onClick={() => navigate('/employer/login')}>Log in</button>
            </div>
            <div className="hero-stats">
              <div className="stat"><div className="n">7<span className="sm">-day</span></div><div className="l">avg. time-to-hire</div></div>
              <div className="stat"><div className="n">135<span className="sm">-day</span></div><div className="l">industry average</div></div>
              <div className="stat"><div className="n">3<span className="sm">-stage</span></div><div className="l">evaluation, done upfront</div></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
