import { Link } from "wouter";
import { SutaeruIcon, type SutaeruIconName } from "@/components/SutaeruIcon";
import { LogoMark } from "@/components/chrome/AppHeader";
import { ConvergeBar, HalftoneRamp } from "@/components/art";
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
          <Link href="/" className="sk-land-brand"><LogoMark /><span>Sutaeru</span></Link>
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
        <HalftoneRamp columns={9} rows={7} className="sk-land-ramp" />
        <p className="sk-land-pill"><i /> Now running <b>&middot;</b> Deep research</p>
        <h1>Ask once.<br />Sutaeru does the rest.</h1>
        <p className="sk-land-lead">Search, deep research and agents that keep working while you are away.</p>
        <div className="sk-land-cta">
          <Link href="/login?mode=signup" className="sk-btn sk-btn-dark sk-btn-lg">Start for free</Link>
          <a href="#demo" className="sk-btn sk-btn-light sk-btn-lg">Watch it work</a>
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
          {FEATURES.map((f) => (
            <article key={f.id} id={f.id} className={`sk-land-card sk-land-card-${f.tone}`}>
              <div className="sk-land-card-head"><SutaeruIcon name={f.icon} className="sk-land-card-icon" /><span className="sk-label">{f.kicker}</span></div>
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
