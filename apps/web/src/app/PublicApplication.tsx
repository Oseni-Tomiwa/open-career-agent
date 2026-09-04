import type { RoleviaApiClient } from '@oca/api-client';
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { browserConfig } from '../config.js';
import type { AuthSession } from './authContext.js';

interface PublicApplicationProps {
  readonly client: RoleviaApiClient;
  readonly unavailable?: boolean;
  readonly onAuthenticated: (session: AuthSession) => void;
}

export function PublicApplication(props: PublicApplicationProps) {
  return (
    <BrowserRouter>
      <PublicLayout>
        <Routes>
          <Route path="/" element={<PublicLandingPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/privacy" element={<LegalPage type="privacy" />} />
          <Route path="/terms" element={<LegalPage type="terms" />} />
          <Route
            path="/sign-in"
            element={<AuthPage mode="sign-in" {...props} />}
          />
          <Route
            path="/create-account"
            element={<AuthPage mode="create-account" {...props} />}
          />
          <Route path="/verify-email" element={<VerifyEmail {...props} />} />
          <Route
            path="/forgot-password"
            element={<ForgotPassword client={props.client} />}
          />
          <Route
            path="/reset-password"
            element={<ResetPassword client={props.client} />}
          />
          <Route path="/auth/callback" element={<OAuthCallback {...props} />} />
          <Route path="*" element={<PublicNotFound />} />
        </Routes>
      </PublicLayout>
    </BrowserRouter>
  );
}

function PublicLayout({ children }: { readonly children: ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [mobileOpen]);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    window.localStorage.setItem('oca-theme', next);
    setTheme(next);
  }

  return (
    <div className="public-site">
      <a className="skip-link" href="#public-content">
        Skip to content
      </a>
      <header className="public-nav">
        <Link className="public-brand" to="/" aria-label="Rolevia home">
          <span className="public-brand-mark" aria-hidden="true">
            R
          </span>
          <span>Rolevia</span>
        </Link>
        <nav
          aria-label="Public navigation"
          className="public-nav-links desktop-only"
        >
          <Link to="/how-it-works">How it works</Link>
          <Link to="/features">Features</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/about">About</Link>
        </nav>
        <div className="public-nav-actions desktop-only">
          <button
            className="theme-button"
            type="button"
            onClick={toggleTheme}
            aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <Link className="button-link secondary" to="/sign-in">
            Sign in
          </Link>
          <Link className="public-nav-cta" to="/create-account">
            Create account
          </Link>
        </div>

        <button
          className="mobile-nav-toggle mobile-only"
          type="button"
          aria-expanded={mobileOpen}
          aria-label={
            mobileOpen ? 'Close navigation menu' : 'Open navigation menu'
          }
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </header>

      {mobileOpen && (
        <div
          className="mobile-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <div
            className="mobile-nav-scrim"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="mobile-nav-content">
            <nav aria-label="Mobile menu links">
              <Link to="/" onClick={() => setMobileOpen(false)}>
                Home
              </Link>
              <Link to="/how-it-works" onClick={() => setMobileOpen(false)}>
                How it works
              </Link>
              <Link to="/features" onClick={() => setMobileOpen(false)}>
                Features
              </Link>
              <Link to="/pricing" onClick={() => setMobileOpen(false)}>
                Pricing
              </Link>
              <Link to="/about" onClick={() => setMobileOpen(false)}>
                About
              </Link>
            </nav>
            <div className="mobile-nav-auth">
              <Link
                className="button-link secondary full-width"
                to="/sign-in"
                onClick={() => setMobileOpen(false)}
              >
                Sign in
              </Link>
              <Link
                className="button-link primary full-width"
                to="/create-account"
                onClick={() => setMobileOpen(false)}
              >
                Create account
              </Link>
              <button
                className="theme-button full-width"
                type="button"
                onClick={toggleTheme}
                aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}
              >
                Toggle {theme === 'dark' ? 'light' : 'dark'} mode
              </button>
            </div>
          </div>
        </div>
      )}

      <main id="public-content" tabIndex={-1}>
        {children}
      </main>

      <footer className="public-footer">
        <div className="public-footer-top">
          <div className="footer-brand-statement">
            <div className="public-brand-footer">
              <span className="public-brand-mark" aria-hidden="true">
                R
              </span>
              <strong>Rolevia</strong>
            </div>
            <p>
              Evidence-grounded career intelligence. Build a factual career
              profile, discover opportunities directly from company sources, and
              evaluate attainability without black-box scores.
            </p>
          </div>

          <div className="public-footer-columns">
            <div className="footer-col">
              <h3>Product</h3>
              <nav aria-label="Product navigation">
                <Link to="/how-it-works">How it works</Link>
                <Link to="/features">Features</Link>
                <Link to="/#discovery">Direct ATS Sources</Link>
                <Link to="/sign-in">Workspace</Link>
              </nav>
            </div>

            <div className="footer-col">
              <h3>Company</h3>
              <nav aria-label="Company navigation">
                <Link to="/about">About Rolevia</Link>
                <Link to="/how-it-works#principles">Core Principles</Link>
                <Link to="/create-account">Create Profile</Link>
              </nav>
            </div>

            <div className="footer-col">
              <h3>Resources & Legal</h3>
              <nav aria-label="Legal navigation">
                <Link to="/pricing">Pricing (Preview)</Link>
                <Link to="/privacy">Privacy Notice</Link>
                <Link to="/terms">Terms of Service</Link>
              </nav>
            </div>

            <div className="footer-col">
              <h3>Account</h3>
              <nav aria-label="Footer navigation">
                <Link to="/sign-in">Sign in</Link>
                <Link to="/create-account">Create account</Link>
                <Link to="/forgot-password">Reset password</Link>
              </nav>
            </div>
          </div>
        </div>

        <div className="public-footer-bottom">
          <span>
            &copy; {new Date().getFullYear()} Rolevia. Open Career Agent. All
            rights reserved.
          </span>
          <span>
            Zero automated bot applications &middot; You retain full control.
          </span>
        </div>

        <div className="public-footer-wordmark">
          <p aria-hidden="true">ROLEVIA</p>
        </div>
      </footer>
    </div>
  );
}

function PublicLandingPage() {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'opportunity' | 'profile' | 'insights'
  >('opportunity');

  return (
    <div className="public-landing">
      {/* 1. HERO */}
      <section className="landing-hero" aria-labelledby="hero-title">
        <div className="landing-hero-copy">
          <p className="public-eyebrow">Evidence-Led Career Intelligence</p>
          <h1 id="hero-title">See your career with greater clarity.</h1>
          <p className="hero-lead">
            Build a factual record of what you have done, discover roles from
            verified company boards, evaluate fit with inspectable evidence, and
            make each next move with confidence.
          </p>
          <div className="public-actions">
            <Link className="button-link primary hero-cta" to="/create-account">
              Create your Career Profile
            </Link>
            <Link className="button-link secondary hero-cta" to="/sign-in">
              Sign in to workspace
            </Link>
          </div>
          <p className="hero-footnote">
            No mystery percentages &middot; Unknown qualifications stay unknown
            &middot; Direct Greenhouse, Lever & Ashby discovery
          </p>
        </div>

        {/* Hero Visual Preview: Opportunity Decision Card */}
        <div
          className="landing-hero-preview"
          aria-label="Example Rolevia opportunity decision card"
        >
          <div className="preview-card-container">
            <div className="preview-card-header">
              <span className="preview-tag verified">
                Direct Source Discovery
              </span>
              <span className="preview-date">Updated Today</span>
            </div>
            <div className="preview-card-body">
              <div className="preview-role-meta">
                <h2>Staff Distributed Systems Engineer</h2>
                <p className="preview-company">
                  Stripe &middot; Remote (North America)
                </p>
              </div>
              <div className="preview-decision-badge pursue">
                <span className="decision-title">
                  High-priority recommendation
                </span>
                <span className="decision-sub">
                  Eligible based on current evidence &middot; Strong fit
                  evidence
                </span>
              </div>
              <div className="preview-engines-grid">
                <div className="engine-cell">
                  <span className="engine-name">Eligibility</span>
                  <strong className="engine-value success">Eligible</strong>
                  <span className="engine-desc">
                    Sponsorship & location match
                  </span>
                </div>
                <div className="engine-cell">
                  <span className="engine-name">Fit</span>
                  <strong className="engine-value fit">Strong</strong>
                  <span className="engine-desc">
                    Distributed consensus & Go
                  </span>
                </div>
                <div className="engine-cell">
                  <span className="engine-name">Opportunity Quality</span>
                  <strong className="engine-value quality">Strong</strong>
                  <span className="engine-desc">
                    $245k–$290k &middot; Direct team
                  </span>
                </div>
                <div className="engine-cell">
                  <span className="engine-name">Uncertainty</span>
                  <strong className="engine-value low">Minimal</strong>
                  <span className="engine-desc">Complete requisition spec</span>
                </div>
              </div>
              <div className="preview-evidence-list">
                <p className="evidence-list-title">Ground-truth evidence:</p>
                <ul>
                  <li>
                    <CheckIcon />
                    <span>
                      Candidate claim: distributed storage experience (evidence
                      attached)
                    </span>
                  </li>
                  <li>
                    <CheckIcon />
                    <span>
                      Candidate claim: Raft / Paxos production operation
                      (work-history evidence attached)
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. PRODUCT PROOF / INTERFACE PREVIEW */}
      <section
        className="landing-section product-proof-section"
        id="preview"
        aria-labelledby="proof-title"
      >
        <div className="section-header">
          <p className="public-eyebrow">Real Product Architecture</p>
          <h2 id="proof-title">
            Inspect real evidence, not decorative summaries.
          </h2>
          <p className="section-subtitle">
            Rolevia is an operating system for your career search. Here is how
            its primary surfaces present actionable intelligence.
          </p>
        </div>

        <div
          className="preview-tabs"
          role="tablist"
          aria-label="Rolevia product views"
        >
          <button
            role="tab"
            aria-selected={activeTab === 'opportunity'}
            className={`tab-btn ${activeTab === 'opportunity' ? 'active' : ''}`}
            onClick={() => setActiveTab('opportunity')}
          >
            Opportunity Analysis
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'overview'}
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Daily Overview & Decisions
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'profile'}
            className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            Career Profile & Claims
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'insights'}
            className={`tab-btn ${activeTab === 'insights' ? 'active' : ''}`}
            onClick={() => setActiveTab('insights')}
          >
            Market Insights
          </button>
        </div>

        <div className="preview-tab-content" role="tabpanel">
          {activeTab === 'opportunity' && (
            <div className="tab-pane">
              <div className="tab-explanation">
                <h3>Structured Requirement Evaluation</h3>
                <p>
                  Every requirement extracted from a job post is matched
                  directly against claims in your Career Profile. Crucially,
                  missing information is labeled as <em>Unknown</em> rather than
                  assumed to be a failure.
                </p>
                <div className="tab-pills">
                  <span className="pill satisfied">
                    No confirmed eligibility blocker
                  </span>
                  <span className="pill unknown">
                    Requirement unknown (inspectable)
                  </span>
                  <span className="pill fit">Strong fit evidence</span>
                </div>
              </div>
              <div className="mock-ui-surface">
                <div className="mock-ui-row verified">
                  <div className="mock-marker">
                    <CheckIcon />
                  </div>
                  <div className="mock-info">
                    <strong>
                      Work Authorization: United States Citizen / Permanent
                      Resident
                    </strong>
                    <small>
                      Grounded in candidate Career Profile &middot; Hard gate
                      met
                    </small>
                  </div>
                  <span className="status-badge met">Supported</span>
                </div>
                <div className="mock-ui-row verified">
                  <div className="mock-marker">
                    <CheckIcon />
                  </div>
                  <div className="mock-info">
                    <strong>
                      Years of Experience: 8+ years backend systems
                    </strong>
                    <small>Grounded in attached work-history evidence</small>
                  </div>
                  <span className="status-badge met">Supported</span>
                </div>
                <div className="mock-ui-row unverified">
                  <div className="mock-marker">
                    <UnknownIcon />
                  </div>
                  <div className="mock-info">
                    <strong>Kubernetes Operator Development</strong>
                    <small>
                      No explicit claim attached yet &middot; Flagged for
                      candidate review, not rejected
                    </small>
                  </div>
                  <span className="status-badge unknown">Unknown</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'overview' && (
            <div className="tab-pane">
              <div className="tab-explanation">
                <h3>Daily Overview & Decisions Ledger</h3>
                <p>
                  Your daily dashboard cuts through hundreds of listings to
                  present explicit recommendations: High Priority opportunities,
                  roles to Consider, items to Investigate, lower-priority work,
                  and confirmed blockers.
                </p>
                <div className="tab-pills">
                  <span className="pill pursue">High Priority</span>
                  <span className="pill explore">Investigate</span>
                  <span className="pill skip">Blocked</span>
                </div>
              </div>
              <div className="mock-ui-surface">
                <div className="mock-overview-item">
                  <div className="mock-overview-header">
                    <span className="badge pursue">HIGH PRIORITY</span>
                    <strong>
                      Principal Platform Architect &middot; Datadog
                    </strong>
                  </div>
                  <p>
                    Current eligibility evidence is clear. Relevant architecture
                    experience is strongly supported; compensation is
                    transparent.
                  </p>
                </div>
                <div className="mock-overview-item">
                  <div className="mock-overview-header">
                    <span className="badge explore">INVESTIGATE</span>
                    <strong>Lead Infrastructure Engineer &middot; Figma</strong>
                  </div>
                  <p>
                    Excellent team mission. Requires clarifying hybrid office
                    policy in San Francisco before committing.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="tab-pane">
              <div className="tab-explanation">
                <h3>Factual Career Memory</h3>
                <p>
                  Your Career Profile is not a static resume. It is an
                  inspectable graph of verifiable claims, artifacts, and career
                  goals that you control and update over time.
                </p>
                <div className="tab-pills">
                  <span className="pill">Isolated Candidate Data</span>
                  <span className="pill">Grounded Evidence</span>
                  <span className="pill">Exportable JSON Ledger</span>
                </div>
              </div>
              <div className="mock-ui-surface">
                <div className="mock-claim-item">
                  <span className="claim-type">EXPERIENCE CLAIM</span>
                  <strong>
                    Designed & Operated Global Multi-Region Spanner Service
                  </strong>
                  <p>
                    Led a team scaling a distributed database service across
                    multiple regions.
                  </p>
                  <span className="claim-evidence">
                    Evidence: architecture whitepapers and code artifacts
                  </span>
                </div>
                <div className="mock-claim-item">
                  <span className="claim-type">SKILL CLAIM</span>
                  <strong>High-Concurrency Rust & Systems Programming</strong>
                  <p>
                    5+ years production codebases, zero-copy serialization,
                    memory profiling.
                  </p>
                  <span className="claim-evidence">
                    Evidence: Open-source repository contributions
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'insights' && (
            <div className="tab-pane">
              <div className="tab-explanation">
                <h3>Aggregated Market Intelligence</h3>
                <p>
                  Discover patterns across the market based on real discovery
                  runs. Understand where your profile consistently aligns, and
                  what skills appear most frequently across your search
                  preferences.
                </p>
                <div className="tab-pills">
                  <span className="pill">Continuous Market Scans</span>
                  <span className="pill">Demand Trends</span>
                  <span className="pill">No Fluff Advice</span>
                </div>
              </div>
              <div className="mock-ui-surface">
                <div className="mock-insight-item">
                  <strong>High Market Alignment</strong>
                  <p>
                    Distributed-systems architecture and Go/Rust experience
                    recur across Staff-level roles in your search targets.
                  </p>
                </div>
                <div className="mock-insight-item">
                  <strong>Common Gap Flag</strong>
                  <p>
                    eBPF networking recurs in targeted infrastructure postings.
                    Add evidence or clarify experience when it is relevant to a
                    role you want to pursue.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3. HOW ROLEVIA WORKS */}
      <section
        className="landing-section workflow-section"
        id="how-it-works"
        aria-labelledby="workflow-title"
      >
        <div className="section-header">
          <p className="public-eyebrow">The 6-Stage Process</p>
          <h2 id="workflow-title">How Rolevia Works</h2>
          <p className="section-subtitle">
            A transparent pipeline designed to answer:{' '}
            <em>
              Of all the opportunities out there, which are worth my time, why,
              and what should I do next?
            </em>
          </p>
        </div>

        <div className="workflow-steps-grid">
          <div className="workflow-card">
            <span className="step-num">01</span>
            <h3>Build your Career Profile</h3>
            <p>
              Record your verified skills, experience claims, and career
              constraints. Attach real artifacts and maintain a durable source
              of truth.
            </p>
          </div>

          <div className="workflow-card">
            <span className="step-num">02</span>
            <h3>Set Search Preferences</h3>
            <p>
              Specify target titles, locations, compensation baselines, and
              direct company ATS job boards (Greenhouse, Lever, Ashby).
            </p>
          </div>

          <div className="workflow-card">
            <span className="step-num">03</span>
            <h3>Discover Opportunities</h3>
            <p>
              Rolevia pulls fresh opportunities straight from source boards,
              keeping full provenance and preventing stale duplicates.
            </p>
          </div>

          <div className="workflow-card">
            <span className="step-num">04</span>
            <h3>Evaluate Attainability & Fit</h3>
            <p>
              Our engine checks strict Eligibility (hard gates) before assessing
              Fit. Where information is missing, it marks it as Unknown instead
              of failing you.
            </p>
          </div>

          <div className="workflow-card">
            <span className="step-num">05</span>
            <h3>Decide What Deserves Action</h3>
            <p>
              Receive explicit recommendations (High Priority, Consider,
              Investigate, Low Priority, or Blocked) with clear, auditable
              reasoning and evidence references.
            </p>
          </div>

          <div className="workflow-card">
            <span className="step-num">06</span>
            <h3>Track Your Pipeline</h3>
            <p>
              Keep the opportunities you pursue organized through applied,
              screening, interview, and offer milestones in one cohesive
              workspace.
            </p>
          </div>
        </div>
      </section>

      {/* 4. DIFFERENTIATORS */}
      <section
        className="landing-section differentiators-section"
        id="features"
        aria-labelledby="diff-title"
      >
        <div className="section-header">
          <p className="public-eyebrow">Core Capabilities</p>
          <h2 id="diff-title">Built on truth, not mysterious probabilities.</h2>
        </div>

        <div className="features-grid">
          <div className="feature-block">
            <div className="feature-icon">
              <ShieldIcon />
            </div>
            <h3>Career Profile & Ground Truth</h3>
            <p>
              Missing information is never assumed to be a disqualification. If
              a job listing requires a capability that isn't documented in your
              profile, Rolevia flags it as an inspectable Unknown rather than
              downgrading your score.
            </p>
          </div>

          <div className="feature-block">
            <div className="feature-icon">
              <LayersIcon />
            </div>
            <h3>Four Transparent Evaluation Engines</h3>
            <p>
              <strong>Eligibility:</strong> Evidence-led evaluation of work
              authorization and core constraints.
              <br />
              <strong>Fit:</strong> Semantic alignment with your verified skills
              and goals.
              <br />
              <strong>Quality:</strong> Listing clarity, compensation openness,
              and hiring signal.
              <br />
              <strong>Decision:</strong> Synthesizes actionable verdicts with
              inspectable evidence.
            </p>
          </div>

          <div className="feature-block" id="discovery">
            <div className="feature-icon">
              <SearchIcon />
            </div>
            <h3>Direct ATS Source Discovery</h3>
            <p>
              Rolevia directly integrates with <strong>Greenhouse</strong>,{' '}
              <strong>Lever</strong>, and <strong>Ashby</strong> company boards.
              No third-party scrapers, no expired job aggregator listings, and
              zero spam.
            </p>
          </div>

          <div className="feature-block">
            <div className="feature-icon">
              <ActivityIcon />
            </div>
            <h3>Transparent Agent Activity Ledger</h3>
            <p>
              Every discovery execution, evaluation check, and decision
              calculation is recorded in a persistent, auditable ledger. You can
              inspect exactly when and why an opportunity was evaluated.
            </p>
          </div>
        </div>
      </section>

      {/* 5. TRUST & PRINCIPLES */}
      <section
        className="landing-section principles-section"
        id="principles"
        aria-labelledby="principles-title"
      >
        <div className="section-header">
          <p className="public-eyebrow">Our Philosophy</p>
          <h2 id="principles-title">Principles of Evidence-Led Intelligence</h2>
          <p className="section-subtitle">
            Why we refuse to build another black-box AI job crawler.
          </p>
        </div>

        <div className="principles-list">
          <div className="principle-item">
            <span className="principle-number">I</span>
            <div>
              <h3>No Mystery Percentages</h3>
              <p>
                Scores are not magical. Every rating is derived from explicit
                rules and linked to traceable claims in your profile.
              </p>
            </div>
          </div>

          <div className="principle-item">
            <span className="principle-number">II</span>
            <div>
              <h3>Unknown Remains Unknown</h3>
              <p>
                Absence of evidence is not evidence of absence. Missing details
                invite investigation, not silent rejection.
              </p>
            </div>
          </div>

          <div className="principle-item">
            <span className="principle-number">III</span>
            <div>
              <h3>No Invented Qualifications</h3>
              <p>
                We do not hallucinate keywords or tell you to fabricate resume
                bullet points to fool applicant tracking systems.
              </p>
            </div>
          </div>

          <div className="principle-item">
            <span className="principle-number">IV</span>
            <div>
              <h3>You Are in Control</h3>
              <p>
                We do not spray automated bots to apply to hundreds of companies
                on your behalf. Rolevia investigates; you choose and apply.
              </p>
            </div>
          </div>

          <div className="principle-item">
            <span className="principle-number">V</span>
            <div>
              <h3>Candidate Isolation</h3>
              <p>
                Your career memory, evidence, and target preferences are
                strictly isolated to your candidate workspace.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. FINAL CTA */}
      <section className="landing-cta-banner" aria-labelledby="cta-title">
        <div className="cta-content">
          <h2 id="cta-title">Make your next career move with evidence.</h2>
          <p>
            Start building your durable career record today. Explore genuine
            opportunities with clear attainability and zero guesswork.
          </p>
          <div className="public-actions">
            <Link className="button-link primary" to="/create-account">
              Create your Career Profile
            </Link>
            <Link className="button-link secondary" to="/sign-in">
              Sign in to workspace
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function HowItWorksPage() {
  return (
    <div className="editorial-page">
      <div className="editorial-container">
        <p className="public-eyebrow">Architecture &amp; Methodology</p>
        <h1>How Rolevia Evaluates Opportunities</h1>
        <p className="lead">
          Rolevia is built on a simple thesis: useful career guidance must
          evaluate whether an opportunity is realistically attainable before
          assessing fit, explain its reasoning, and ground candidate claims in
          verified evidence.
        </p>

        <section className="editorial-section">
          <h2>1. Grounding Your Career Memory</h2>
          <p>
            Traditional platforms ask you to upload a PDF resume, which is
            parsed into flat keywords. Rolevia instead models your career as an
            inspectable graph of <strong>Claims</strong> backed by{' '}
            <strong>Evidence</strong>.
          </p>
          <p>
            When you document an achievement, position, or technical capability,
            it becomes an auditable record. You can attach artifacts, public
            repositories, or work products. If a skill isn’t recorded, we treat
            it as unknown—never as an assumed weakness.
          </p>
        </section>

        <section className="editorial-section">
          <h2>2. Direct Multi-Source Discovery</h2>
          <p>
            Rather than indexing noisy search-engine results or scraping
            unmaintained forums, Rolevia connects directly to official company
            applicant tracking systems:
          </p>
          <ul>
            <li>
              <strong>Greenhouse:</strong> Direct API board synchronization.
            </li>
            <li>
              <strong>Lever:</strong> Structured postings with full requisition
              identifiers.
            </li>
            <li>
              <strong>Ashby:</strong> Up-to-date board feeds with verified
              compensation and department metadata.
            </li>
          </ul>
        </section>

        <section className="editorial-section">
          <h2>3. The Four-Stage Intelligence Engine</h2>
          <p>Opportunities undergo evaluation through four isolated engines:</p>
          <ol>
            <li>
              <strong>Eligibility Engine:</strong> Evaluates mandatory hard
              constraints (visa sponsorship, location limits, license
              requirements). If an eligibility condition fails, the opportunity
              is not suggested for pursuit.
            </li>
            <li>
              <strong>Fit Engine:</strong> Compares the role’s technical and
              domain scope against your career goals and verified capabilities.
            </li>
            <li>
              <strong>Quality Engine:</strong> Analyzes listing clarity,
              compensation transparency, and direct team signals.
            </li>
            <li>
              <strong>Decision Engine:</strong> Weighs all three outputs to
              recommend what deserves attention, what needs investigation, and
              what is currently blocked.
            </li>
          </ol>
        </section>

        <section className="editorial-section">
          <h2>4. Human Agency Above All</h2>
          <p>
            Rolevia does not auto-apply or submit unreviewed materials to
            employers. We give you all the intelligence you need to make
            deliberate, high-conviction moves.
          </p>
          <div className="public-actions">
            <Link className="button-link primary" to="/create-account">
              Create account
            </Link>
            <Link className="button-link secondary" to="/sign-in">
              Sign in
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function FeaturesPage() {
  return (
    <div className="editorial-page">
      <div className="editorial-container">
        <p className="public-eyebrow">Platform Capabilities</p>
        <h1>Rolevia Features</h1>
        <p className="lead">
          Everything you need to orchestrate a high-signal, evidence-driven
          career search.
        </p>

        <div className="features-editorial-grid">
          <article className="feature-editorial-card">
            <h3>Verified Career Profile</h3>
            <p>
              A persistent, structured memory of your experience, skills, and
              projects with provenance and explicit unknown handling.
            </p>
          </article>
          <article className="feature-editorial-card">
            <h3>Multi-Source Search Preferences</h3>
            <p>
              Author search targets configuring multiple direct ATS boards
              simultaneously (Greenhouse, Lever, Ashby) with deduplication.
            </p>
          </article>
          <article className="feature-editorial-card">
            <h3>Four Evaluation Engines</h3>
            <p>
              Independent evaluation of Eligibility, Fit, Opportunity Quality,
              and actionable Decision recommendations.
            </p>
          </article>
          <article className="feature-editorial-card">
            <h3>Persistent Agent Activity Ledger</h3>
            <p>
              Complete auditability of every discovery run and opportunity
              assessment executed by the agent.
            </p>
          </article>
          <article className="feature-editorial-card">
            <h3>Application Stage Tracking</h3>
            <p>
              Track your pursuit lifecycle from initial bookmark to applied,
              screening, interview, and offer milestones.
            </p>
          </article>
          <article className="feature-editorial-card">
            <h3>Market Alignment Insights</h3>
            <p>
              Aggregated feedback on where your verified profile consistently
              intersects with open positions across your search targets.
            </p>
          </article>
        </div>

        <div className="public-actions">
          <Link className="button-link primary" to="/create-account">
            Get started
          </Link>
          <Link className="button-link secondary" to="/how-it-works">
            Learn more
          </Link>
        </div>
      </div>
    </div>
  );
}

function PricingPage() {
  return (
    <div className="editorial-page">
      <div className="editorial-container">
        <p className="public-eyebrow">Plans &amp; Availability</p>
        <h1>Rolevia Developer Preview</h1>
        <p className="lead">
          Rolevia is currently in development and developer preview. Full
          commercial subscriptions and Rolevia Pro features are planned for
          future milestones.
        </p>

        <div className="preview-tier-card">
          <div className="preview-tier-header">
            <h3>Developer &amp; Early Preview</h3>
            <span className="tier-badge">Currently Active</span>
          </div>
          <p className="tier-price">Free during Preview</p>
          <ul className="tier-features">
            <li>
              <CheckIcon /> Full Career Profile &amp; Evidence Claims
            </li>
            <li>
              <CheckIcon /> Multi-Source Search Preferences (Greenhouse, Lever,
              Ashby)
            </li>
            <li>
              <CheckIcon /> Complete Eligibility, Fit, Quality &amp; Decision
              Engines
            </li>
            <li>
              <CheckIcon /> Application Workflow Tracking
            </li>
            <li>
              <CheckIcon /> Persistent Agent Activity Ledger
            </li>
          </ul>
          <Link className="button-link primary full-width" to="/create-account">
            Create Preview Account
          </Link>
        </div>

        <p className="preview-disclaimer">
          Note: Commercial billing, enterprise integrations, and team
          subscriptions are not active. There are no paid upgrades or paywalls
          in this release.
        </p>
      </div>
    </div>
  );
}

function AboutPage() {
  return (
    <div className="editorial-page">
      <div className="editorial-container">
        <p className="public-eyebrow">Our Mission</p>
        <h1>About Rolevia</h1>
        <p className="lead">
          Rolevia is built to eliminate the noise, spam, and opaque ranking
          algorithms that dominate modern career search.
        </p>
        <section className="editorial-section">
          <h2>Why We Exist</h2>
          <p>
            Job seekers today face a broken landscape: generic job boards
            flooded with sponsored duplicates, automated bots spamming employers
            with low-conviction applications, and applicant tracking algorithms
            rejecting candidates based on absent keywords.
          </p>
          <p>
            We believe that career intelligence should work for the candidate.
            It should build an accurate, verifiable record of what you actually
            know, evaluate opportunities directly against facts, and highlight
            what is genuinely attainable before you spend your time applying.
          </p>
        </section>

        <div className="public-actions">
          <Link className="button-link primary" to="/create-account">
            Join the preview
          </Link>
          <Link className="button-link secondary" to="/how-it-works">
            Read how it works
          </Link>
        </div>
      </div>
    </div>
  );
}

function LegalPage({ type }: { readonly type: 'privacy' | 'terms' }) {
  const isPrivacy = type === 'privacy';
  return (
    <div className="editorial-page">
      <div className="editorial-container">
        <p className="public-eyebrow">Developer Preview Document</p>
        <h1>{isPrivacy ? 'Privacy Notice' : 'Terms of Service'}</h1>
        <p className="lead">
          This document outlines our commitment to data integrity and candidate
          ownership during the Rolevia developer preview.
        </p>

        <section className="editorial-section">
          <h2>1. Data Ownership &amp; Candidate Isolation</h2>
          <p>
            Your career claims, evidence, search targets, and application
            records belong to you. When deployed in local development mode, all
            data resides in your local environment. In Rolevia Cloud, candidate
            records are strictly tenant-isolated.
          </p>
        </section>

        <section className="editorial-section">
          <h2>2. No Automated Third-Party Submissions</h2>
          <p>
            Rolevia does not submit applications, forward resumes, or contact
            employers on your behalf without your explicit initiation. You
            retain full control over when, where, and how you apply.
          </p>
        </section>

        <section className="editorial-section">
          <h2>3. Preview Draft Status</h2>
          <p>
            This is an early developer preview policy. Final commercial terms of
            service and formal enterprise privacy commitments will be provided
            prior to commercial availability.
          </p>
        </section>

        <div className="public-actions">
          <Link className="button-link primary" to="/">
            Return home
          </Link>
        </div>
      </div>
    </div>
  );
}

function AuthPage({
  mode,
  client,
  onAuthenticated,
  unavailable,
}: PublicApplicationProps & { readonly mode: 'sign-in' | 'create-account' }) {
  const creating = mode === 'create-account';
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(
    unavailable
      ? 'Rolevia could not reach the account service. Try again shortly.'
      : null,
  );
  const [notice, setNotice] = useState<{
    message: string;
    developmentActionUrl?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [providers, setProviders] = useState({ google: false, apple: false });
  const [showPassword, setShowPassword] = useState(false);
  const [passwordValue, setPasswordValue] = useState('');

  useEffect(() => {
    let active = true;
    void client
      .getAuthCapabilities()
      .then((value) => {
        if (active) setProviders(value.providers);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const email = formValue(form, 'email');
    const password = formValue(form, 'password');
    try {
      if (creating) {
        const result = await client.register({
          email,
          password,
          transport: 'cookie',
        });
        setNotice(result);
      } else {
        const result = await client.login({
          email,
          password,
          transport: 'cookie',
        });
        onAuthenticated(result.session);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Authentication could not be completed.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (notice) {
    return (
      <AuthComposition
        title="Check your email"
        supporting={notice.message}
        mode={mode}
      >
        <div className="auth-notice" role="status">
          <p>The verification link expires in 30 minutes.</p>
          {notice.developmentActionUrl && (
            <a href={notice.developmentActionUrl} className="dev-verify-link">
              Open local verification link
            </a>
          )}
          <button
            className="text-button"
            type="button"
            onClick={() => void navigate('/sign-in')}
          >
            Return to sign in
          </button>
        </div>
      </AuthComposition>
    );
  }

  return (
    <AuthComposition
      title={
        unavailable
          ? 'Rolevia Cloud is unavailable'
          : creating
            ? 'Create your Rolevia account'
            : 'Welcome back'
      }
      supporting={
        unavailable
          ? 'The account service could not be contacted. Verify network connectivity.'
          : creating
            ? 'Build your career profile and start discovering opportunities evaluated against real evidence.'
            : 'Sign in to continue your Rolevia workspace.'
      }
      mode={mode}
    >
      <div className="provider-buttons">
        {(['google', 'apple'] as const).map((provider) => (
          <button
            key={provider}
            disabled={!providers[provider]}
            aria-disabled={!providers[provider]}
            onClick={() => {
              if (!providers[provider]) return;
              window.location.href = client.oauthStartUrl(provider);
            }}
            type="button"
            className={`provider-btn ${provider}`}
          >
            {provider === 'google' ? <GoogleIcon /> : <AppleIcon />}
            <span>
              Continue with {provider === 'google' ? 'Google' : 'Apple'}
            </span>
            {!providers[provider] && (
              <span className="sr-only"> (not configured)</span>
            )}
          </button>
        ))}
      </div>

      <div className="auth-divider">
        <span>or use email</span>
      </div>

      <form
        className="public-auth-form"
        onSubmit={(event) => void submit(event)}
        noValidate={false}
      >
        <div className="form-field">
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </div>

        <div className="form-field">
          <div className="field-label-row">
            <label htmlFor="auth-password">Password</label>
            {!creating && (
              <Link className="forgot-link" to="/forgot-password">
                Forgot password?
              </Link>
            )}
          </div>
          <div className="password-input-wrapper">
            <input
              id="auth-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={creating ? 'new-password' : 'current-password'}
              minLength={creating ? 12 : 1}
              required
              value={passwordValue}
              onChange={(e) => setPasswordValue(e.target.value)}
              placeholder={
                creating ? 'At least 12 characters' : 'Enter your password'
              }
            />
            <button
              type="button"
              className="password-toggle-btn"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword(!showPassword)}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>

          {creating && (
            <div className="password-requirements" role="status">
              <span
                className={`requirement-indicator ${passwordValue.length >= 12 ? 'met' : 'unmet'}`}
              >
                <CheckIcon /> At least 12 characters
              </span>
            </div>
          )}
        </div>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button
          className="auth-submit"
          disabled={submitting || unavailable}
          type="submit"
        >
          {submitting ? 'Working…' : creating ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <p className="auth-alternate">
        {creating ? 'Already have an account? ' : 'New to Rolevia? '}
        <Link to={creating ? '/sign-in' : '/create-account'}>
          {creating ? 'Sign in' : 'Create account'}
        </Link>
      </p>

      {/* Local development profile isolated card */}
      {!creating && browserConfig.deploymentMode === 'development' && (
        <div className="dev-auth-card">
          <div className="dev-badge-row">
            <span className="dev-badge">[DEV ONLY] Development profile</span>
          </div>
          <p>
            Bypass external authentication to inspect the local candidate
            workspace.
          </p>
          <button
            className="dev-auth-btn"
            type="button"
            onClick={() => {
              onAuthenticated({
                user: { id: 'usr_dev', email: 'developer@rolevia.test' },
                candidateIds: [
                  browserConfig.developmentCandidateId ?? 'candidate_test',
                ],
                primaryCandidateId:
                  browserConfig.developmentCandidateId ?? 'candidate_test',
                expiresAt: new Date(Date.now() + 86400000).toISOString(),
              });
            }}
          >
            Continue with development profile
          </button>
        </div>
      )}
    </AuthComposition>
  );
}

function AuthComposition({
  title,
  supporting,
  children,
  mode = 'sign-in',
}: {
  readonly title: string;
  readonly supporting: string;
  readonly children: ReactNode;
  readonly mode?: 'sign-in' | 'create-account';
}) {
  const isSignIn = mode === 'sign-in';

  return (
    <section
      className={`auth-composition ${mode}`}
      aria-labelledby="auth-title"
    >
      <div className="auth-story">
        <p className="story-eyebrow">
          {isSignIn ? 'Welcome back' : 'Your career, directed by you'}
        </p>
        <blockquote>
          {isSignIn
            ? 'Return to your career workspace. Evidence-backed evaluations and continuous discovery waiting for you.'
            : 'Build your career profile and start discovering opportunities evaluated against real evidence.'}
        </blockquote>
        <div className="story-meta">
          <span>{isSignIn ? 'Need an account?' : 'Already registered?'}</span>
          <Link to={isSignIn ? '/create-account' : '/sign-in'}>
            {isSignIn ? 'Create account' : 'Sign in'} &rarr;
          </Link>
        </div>
      </div>
      <div className="auth-form-panel">
        <div className="auth-form-inner">
          <p className="public-eyebrow">Rolevia account</p>
          <h1 id="auth-title">{title}</h1>
          <p className="auth-supporting">{supporting}</p>
          {children}
        </div>
      </div>
    </section>
  );
}

function VerifyEmail({ client, onAuthenticated }: PublicApplicationProps) {
  const location = useLocation();
  const [token] = useState(
    () => new URLSearchParams(location.search).get('token') ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    window.history.replaceState({}, '', '/verify-email');
  }, []);
  async function verifyEmail() {
    setWorking(true);
    setError(null);
    try {
      const result = await client.completeVerification({
        token,
        transport: 'cookie',
      });
      onAuthenticated(result.session);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Email verification failed.',
      );
      setWorking(false);
    }
  }
  return (
    <SimpleAuthPage title="Verify your email">
      <p>Confirm this address to finish creating your Rolevia account.</p>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="auth-submit"
        disabled={!token || working}
        onClick={() => void verifyEmail()}
        type="button"
      >
        {working ? 'Verifying…' : 'Verify email'}
      </button>
      {!token && (
        <p className="auth-error">This verification link is incomplete.</p>
      )}
    </SimpleAuthPage>
  );
}

function ForgotPassword({ client }: { readonly client: RoleviaApiClient }) {
  const [message, setMessage] = useState<string | null>(null);
  const [developmentActionUrl, setDevelopmentActionUrl] = useState<
    string | null
  >(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = formValue(new FormData(event.currentTarget), 'email');
    try {
      const result = await client.requestPasswordReset({ email });
      setMessage(result.message);
      setDevelopmentActionUrl(result.developmentActionUrl ?? null);
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : 'The request could not be completed.',
      );
    }
  }
  return (
    <SimpleAuthPage title="Reset your password">
      <p>
        Enter your email. We will send recovery instructions if the account
        supports password sign-in.
      </p>
      <form
        className="public-auth-form"
        onSubmit={(event) => void submit(event)}
      >
        <div className="form-field">
          <label htmlFor="reset-email">Email</label>
          <input
            id="reset-email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <button className="auth-submit" type="submit">
          Send reset link
        </button>
      </form>
      {message && (
        <p className="auth-notice" role="status">
          {message}
        </p>
      )}
      {developmentActionUrl && (
        <a href={developmentActionUrl} className="dev-verify-link">
          Open local reset link
        </a>
      )}
      <p className="auth-alternate">
        <Link to="/sign-in">Return to sign in</Link>
      </p>
    </SimpleAuthPage>
  );
}

function ResetPassword({ client }: { readonly client: RoleviaApiClient }) {
  const location = useLocation();
  const [token] = useState(
    () => new URLSearchParams(location.search).get('token') ?? '',
  );
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    window.history.replaceState({}, '', '/reset-password');
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = formValue(new FormData(event.currentTarget), 'password');
    try {
      const result = await client.completePasswordReset({ token, password });
      setMessage(result.message);
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : 'The reset link is invalid or expired.',
      );
    }
  }
  return (
    <SimpleAuthPage title="Choose a new password">
      <form
        className="public-auth-form"
        onSubmit={(event) => void submit(event)}
      >
        <div className="form-field">
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </div>
        <button className="auth-submit" disabled={!token} type="submit">
          Change password
        </button>
      </form>
      {message && (
        <p className="auth-notice" role="status">
          {message}
        </p>
      )}
      {message && (
        <p className="auth-alternate">
          <Link to="/sign-in">Continue to sign in</Link>
        </p>
      )}
    </SimpleAuthPage>
  );
}

function OAuthCallback({ client, onAuthenticated }: PublicApplicationProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const status = params.get('status');
  const redirect = safeRedirect(params.get('redirect'));
  const [error, setError] = useState<string | null>(() =>
    status === 'success'
      ? null
      : status === 'cancelled'
        ? 'Social sign-in was cancelled.'
        : 'Social sign-in could not be completed.',
  );
  useEffect(() => {
    window.history.replaceState({}, '', '/auth/callback');
    if (status !== 'success') return;
    void client
      .getSession()
      .then((session) => {
        window.history.replaceState({}, '', redirect);
        onAuthenticated(session);
      })
      .catch(() => setError('The new session could not be confirmed.'));
  }, [client, onAuthenticated, redirect, status]);
  return (
    <SimpleAuthPage
      title={error ? 'Sign-in interrupted' : 'Completing sign-in'}
    >
      {error ? (
        <>
          <p className="auth-error" role="alert">
            {error}
          </p>
          <button
            className="text-button"
            onClick={() => void navigate('/sign-in')}
            type="button"
          >
            Return to sign in
          </button>
        </>
      ) : (
        <p role="status">Confirming your secure session…</p>
      )}
    </SimpleAuthPage>
  );
}

function SimpleAuthPage({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="simple-auth-page">
      <div>
        <p className="public-eyebrow">Rolevia account</p>
        <h1>{title}</h1>
        {children}
      </div>
    </section>
  );
}

function PublicNotFound() {
  return (
    <section className="public-not-found">
      <p className="public-eyebrow">404 &middot; Page not found</p>
      <h1>This path does not lead anywhere yet.</h1>
      <p>The page may have moved, or the address may be incomplete.</p>
      <Link className="button-link primary" to="/">
        Return home
      </Link>
    </section>
  );
}

function safeRedirect(value: string | null): string {
  return value?.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
    ? value
    : '/overview';
}

function formValue(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

// Crisp recognizable SVG Icons
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.36 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.88c.64-.78 1.08-1.86.96-2.94-.93.04-2.06.62-2.73 1.4-.59.68-1.11 1.77-.97 2.83 1.04.08 2.1-.51 2.74-1.29Z" />
    </svg>
  );
}

function EyeIcon({ open }: { readonly open: boolean }) {
  if (open) {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function UnknownIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}
