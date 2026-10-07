import { Link } from "wouter";
import { SutaeruGlyph, SutaeruSeal } from "@/components/brand";
import { HalftoneRamp, ConvergeBar } from "@/components/art";

export interface LandingProps {
  className?: string;
}

export function Landing({ className }: LandingProps) {
  return (
    <div className={`sk-landing ${className || ""}`}>
      <header className="sk-land-nav-wrap">
        <nav className="sk-land-nav" aria-label="Main">
          <Link href="/" className="sk-land-brand">
            <SutaeruGlyph detail="full" size={96} className="sk-land-glyph" />
            <span className="sk-land-word">Sutaeru</span>
            <SutaeruSeal className="sk-land-seal" rough={false} />
          </Link>
          <div className="sk-land-links">
            <a href="#search">Search</a>
            <a href="#research">Research</a>
            <a href="#agents">Agents</a>
            <a href="#start">Pricing</a>
          </div>
          <Link href="/login?mode=signup" className="sk-land-signin">Sign in</Link>
        </nav>
      </header>

      <section className="sk-land-hero">
        <div className="sk-plus sk-plus-tl" aria-hidden="true" />
        <div className="sk-plus sk-plus-tr" aria-hidden="true" />
        <HalftoneRamp columns={9} rows={7} className="sk-land-ramp" />
        <p className="sk-land-pill"><i aria-hidden="true" /> Now running <b>&middot;</b> Deep research</p>
        <h1 className="sk-land-title">Ask once.<br />Sutaeru does the rest.</h1>
        <p className="sk-land-lead">Search, deep research and agents that keep working while you are away.</p>
        <div className="sk-land-cta">
          <Link href="/login?mode=signup" className="btn ink big">Start for free</Link>
          <a href="#demo" className="btn big">Watch it work</a>
        </div>

        <div id="demo" className="sk-land-session" aria-label="Example of a Sutaeru session">
          <span className="sk-label">Session <b>&middot;</b> Running</span>
          <strong>Off-grid solar for villages: cost per kWh</strong>
          <ConvergeBar progress={0.62} showPercent etaOverride="ABOUT 6 MIN LEFT" ariaLabel="Example of a running Sutaeru session" />
        </div>
      </section>

      <section className="sk-land-features" id="features">
        <p className="sk-label">What Sutaeru does</p>
        <h2>One workspace. Four ways to get work done.</h2>
        <div className="sk-land-grid">
          <article id="research" className="sk-land-card sk-land-card-wide">
            <div className="sk-land-card-head">
              <svg className="sk-land-card-icon ico" viewBox="0 0 96 96" aria-hidden="true"><path d="m20 34 28-15 28 15-28 15-28-15Z"/><path d="m28 46 20 11 20-11M28 57l20 11 20-11"/></svg>
              <span className="sk-label">Deep research</span>
            </div>
            <div className="sk-land-card-copy"><h3>Hours of reading, in minutes.</h3><p>Plans the work, reads the sources, cites everything, and hands you a finished report.</p></div>
          </article>
          <article id="search" className="sk-land-card sk-land-card-light">
            <div className="sk-land-card-head">
              <svg className="sk-land-card-icon ico" viewBox="0 0 96 96" aria-hidden="true"><circle cx="42" cy="40" r="18"/><path d="m55 53 15 15"/></svg>
              <span className="sk-label">Search</span>
            </div>
            <div className="sk-land-card-copy"><h3>Answers with receipts.</h3><p>Fast web search with sources you can click.</p></div>
          </article>
          <article id="agents" className="sk-land-card sk-land-card-light">
            <div className="sk-land-card-head">
              <svg className="sk-land-card-icon ico" viewBox="0 0 96 96" aria-hidden="true"><path d="M48 17c18 0 29 13 29 31v25H19V48c0-18 11-31 29-31Z"/><circle cx="48" cy="47" r="14"/><path d="M32 73V62M64 73V62"/></svg>
              <span className="sk-label">Agents</span>
            </div>
            <div className="sk-land-card-copy"><h3>Hand it a task.</h3><p>Agents browse, write and file while you are away.</p></div>
          </article>
          <article id="memory" className="sk-land-card sk-land-card-light">
            <div className="sk-land-card-head">
              <svg className="sk-land-card-icon ico" viewBox="0 0 96 96" aria-hidden="true"><ellipse cx="48" cy="23" rx="24" ry="9"/><path d="M24 23v47c0 5 11 9 24 9s24-4 24-9V23M24 46c0 5 11 9 24 9s24-4 24-9"/></svg>
              <span className="sk-label">Memory</span>
            </div>
            <div className="sk-land-card-copy"><h3>It remembers how you work.</h3><p>Your preferences and past projects, kept private.</p></div>
          </article>
          <article id="make" className="sk-land-card sk-land-card-dark">
            <div className="sk-land-card-head">
              <svg className="sk-land-card-icon ico" viewBox="0 0 96 96" aria-hidden="true"><path d="M48 13c2 20 10 31 26 35-16 4-24 15-26 35-2-20-10-31-26-35 16-4 24-15 26-35Z"/></svg>
              <span className="sk-label">Do & make</span>
            </div>
            <div className="sk-land-card-copy"><h3>From answer to finished file.</h3><p>Reports, decks and sheets, ready to send.</p></div>
          </article>
        </div>
      </section>

      <section className="sk-land-band" id="start">
        <div className="sk-plus sk-plus-tl" aria-hidden="true" />
        <div className="sk-plus sk-plus-tr" aria-hidden="true" />
        <div>
          <h2>Start asking.</h2>
          <p>Free to try. No card needed. Keep working while it works.</p>
        </div>
        <div className="sk-land-band-cta">
          <Link href="/login?mode=signup" className="btn ink big">Start for free</Link>
          <span className="sk-label"><i aria-hidden="true" /> All systems live</span>
        </div>
      </section>
    </div>
  );
}

export default Landing;