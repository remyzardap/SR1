import { Link } from "wouter";
import { LandingMark } from "@/components/LandingMark";
import { SutaeruIcon, type SutaeruIconName } from "@/components/SutaeruIcon";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import "@/styles/landing.css";

const FEATURES: Array<{ id: string; icon: SutaeruIconName; kicker: string; title: string; copy: string; tone: "wide" | "light" | "dark" }> = [
  { id: "research", icon: "research", kicker: "Deep research", title: "Hours of reading, in minutes.", copy: "Plans the work, reads the sources, cites everything, and hands you a finished report.", tone: "wide" },
  { id: "search", icon: "search", kicker: "Search", title: "Answers with receipts.", copy: "Fast web search with sources you can click.", tone: "light" },
  { id: "agents", icon: "agent", kicker: "Agents", title: "Hand it a task.", copy: "Agents browse, write and file while you are away.", tone: "light" },
  { id: "memory", icon: "memory", kicker: "Memory", title: "It remembers how you work.", copy: "Your preferences and past projects, kept private.", tone: "light" },
  { id: "make", icon: "make", kicker: "Do & make", title: "From answer to finished file.", copy: "Reports, decks and sheets, ready to send.", tone: "dark" },
];

function Plus() {
  return (
    <>
      <span className="sk-plus sk-plus-tl" aria-hidden="true" />
      <span className="sk-plus sk-plus-tr" aria-hidden="true" />
    </>
  );
}

export default function Landing() {
  useSeoMeta({ title: "Sutaeru: ask once, Sutaeru does the rest", path: "/", appendSiteName: false });

  return (
    <div className="sk-landing">
      <header className="sk-land-nav-wrap">
        <nav className="sk-land-nav" aria-label="Main">
          <Link href="/" className="sk-land-brand"><LandingMark className="sk-land-glyph" /><span>Sutaeru</span></Link>
          <div className="sk-land-links">
            <a href="#search">Search</a>
            <a href="#research">Research</a>
            <a href="#agents">Agents</a>
            <a href="#start">Pricing</a>
          </div>
          <Link href="/login" className="sk-land-signin">Sign in</Link>
        </nav>
      </header>

      <section className="sk-land-hero">
        <Plus />
        <p className="sk-land-pill"><i /> Now running <b>&middot;</b> Deep research</p>
        <h1>Ask once.<br />Sutaeru does the rest.</h1>
        <p className="sk-land-lead">Search, deep research and agents that keep working while you are away. One calm workspace for answers and finished work.</p>
        <div className="sk-land-cta">
          <Link href="/login?mode=signup" className="sk-btn sk-btn-dark sk-btn-lg">Start for free</Link>
          <a href="#demo" className="sk-btn sk-btn-light sk-btn-lg">Watch it work</a>
        </div>

        <div id="demo" className="sk-land-demo" aria-label="Example of a Sutaeru session">
          <div className="sk-land-demo-head">
            <span className="sk-label">Session <b>&middot;</b> Deep research</span>
            <span className="sk-land-ask">Compare off-grid solar + battery cost for remote villages</span>
          </div>
          <div className="sk-land-demo-body">
            <div className="sk-land-run">
              <div className="sk-land-run-top"><span><i /> web.search <b>&middot;</b> 14 sources</span><span>0:42</span></div>
              <p>Reading IRENA, PLN tariff data, vendor spec sheets</p>
              <div className="sk-land-dots"><u /><u /><u /><u className="on" /><u className="off" /><u className="off" /><u className="off" /><span>Step 4 of 7</span></div>
            </div>
            <div className="sk-land-report">
              <span className="sk-label">Report <b>&middot;</b> Draft</span>
              <strong>Off-grid solar for villages: cost per kWh by system size</strong>
              <div className="sk-land-bar"><span /></div>
            </div>
          </div>
          <div className="sk-land-demo-input"><span>Ask anything, or hand Sutaeru a task...</span><i /></div>
        </div>
      </section>

      <section className="sk-land-features" id="features">
        <p className="sk-label">What Sutaeru does</p>
        <h2>One workspace. Four ways to get work done.</h2>
        <div className="sk-land-grid">
          {FEATURES.map((f) => (
            <article key={f.id} id={f.id} className={`sk-land-card sk-land-card-${f.tone}`}>
              <div className="sk-land-card-head"><SutaeruIcon name={f.icon} className="sk-land-card-icon" /><span className="sk-label">{f.kicker}</span></div>
              {f.tone === "wide" && (
                <div className="sk-land-mini">
                  <div className="sk-land-bar sk-land-bar-lg"><span /></div>
                  <div className="sk-land-dots"><u /><u /><u /><u /><u className="on" /><u className="off" /><u className="off" /></div>
                </div>
              )}
              <div className="sk-land-card-copy"><h3>{f.title}</h3><p>{f.copy}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="sk-land-band" id="start">
        <Plus />
        <div>
          <h2>Start asking.</h2>
          <p>Free to try. No card needed. Keep working while it works.</p>
        </div>
        <div className="sk-land-band-cta">
          <Link href="/login?mode=signup" className="sk-btn sk-btn-light sk-btn-lg">Start for free</Link>
          <span className="sk-label"><i /> All systems live</span>
        </div>
      </section>
    </div>
  );
}
