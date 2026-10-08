import * as React from "react";
import { useRef, type ReactNode } from "react";
import { HalftoneRamp } from "@/components/art";
import { useReducedMotion } from "@/components/art/useMotion";
import { SutaeruGlyph, SutaeruSeal } from "@/components/brand";
import { SutaeruIcon } from "@/components/SutaeruIcon";
import { cn } from "@/lib/utils";
import { CanvasBar } from "./Bar";
import { HomeComposer, type HomeComposerProps } from "./HomeComposer";
import { useKeyboardInset } from "./useKeyboardInset";
import { useRampEnergy } from "./useRampEnergy";

/** One line of RECENTLY UPDATED. The leading state element depends on `kind`. */
export interface HomeRecentRow {
  id: string;
  /** running = live rings and a bar, queued = the waiting row, photo = a thumbnail. */
  kind: "running" | "done" | "stopped" | "queued" | "photo";
  title: string;
  /** Right-aligned time. The prototype leaves it off the waiting row. */
  when?: string;
  /** 0..1, the running row's bar and percent. */
  progress?: number;
  /** The chip in the caption row, e.g. "Done". Omit for a plain history row. */
  tag?: string;
  /** Photo rows: the real picture. */
  image?: { src: string; alt: string };
  /** Omitted for a row that has nothing to open yet. */
  onSelect?: () => void;
}

export interface HomeScreenProps {
  rows: HomeRecentRow[];
  composer: HomeComposerProps;
  /** The thread is being read from the server: the rows are placeholders. */
  loading?: boolean;
  /** First visit: the loop draws, the seal is pressed. */
  intro?: boolean;
  /** A recording is open, which drives the ramp and the meter. */
  listening?: boolean;
  /** Offline and update banners, above the rows as the prototype orders them. */
  banners?: ReactNode;
  onHandoff: () => void;
}

/**
 * Home, the screen the prototype draws in `VIEWS.home` (design/sutaeru-app/app.js:511-563).
 * Presentational only: the rows and the composer's behaviour arrive as props.
 */
export function HomeScreen({ rows, composer, loading, intro, listening, banners, onHandoff }: HomeScreenProps) {
  const heroRef = useRef<HTMLDivElement | null>(null);
  const pulse = useRampEnergy(heroRef, !!listening);
  useKeyboardInset();
  // The prototype skips the intro under reduced motion as surely as on a second visit.
  const showIntro = !!intro && !useReducedMotion();

  return (
    <section className={cn("view", "home", "view-enter", composer.privateChat && "private-on")}>
      <div className={cn("home-hero", "lockup", showIntro ? "intro" : "no-intro")} ref={heroRef}>
        <SutaeruGlyph detail="full" className="mark" />
        <div className="word-row">
          <h1 className="word">Sutaeru</h1>
          <SutaeruSeal className="hero-seal" />
        </div>
        <p className="mono tagline">Ask once. We do the rest.</p>
        <HalftoneRamp row id="ramp" />
      </div>

      <div className="home-dock">
        <HomeComposer {...composer} onActivity={pulse} />
      </div>

      <div className="home-lists">
        {banners}
        <div className="sec-label" style={{ marginTop: "6px" }}>
          <span className="mono">Recently updated</span>
        </div>
        <div
          className="recent"
          role={loading ? "status" : "group"}
          aria-busy={loading || undefined}
          aria-label="Recently updated"
        >
          {loading ? <SkeletonRows /> : rows.map((row) => <RecentRow key={row.id} row={row} />)}
          {!loading && rows.length === 0 && <p className="mono recent-empty">Nothing here yet.</p>}
        </div>
        <button type="button" className="handoff" onClick={onHandoff}>
          <span className="hi"><SutaeruIcon name="make" signal={false} className="ico" /></span>
          <span className="tx"><b>Hand off a project</b><small>Works while you are away</small></span>
          <span className="cols art-deco" aria-hidden="true" />
          <span className="go"><SutaeruIcon name="upright" signal={false} className="ico" /></span>
        </button>
      </div>
    </section>
  );
}

/** The waiting row is a plain div in the prototype: there is nothing to open yet. */
function RecentRow({ row }: { row: HomeRecentRow }) {
  if (row.kind === "queued") {
    return (
      <div className="recent-row queued">
        <span className="st"><SutaeruIcon name="send" signal={false} className="ico" /></span>
        <span className="tx">
          <b>{row.title}</b>
          <span className="sub">
            <span className="mono">Waiting to send</span>
            <i className="dotline" />
          </span>
        </span>
      </div>
    );
  }

  const percent = Math.round((row.progress ?? 0) * 100);
  return (
    <button type="button" className="recent-row" onClick={row.onSelect}>
      <span className={cn("st", row.kind === "photo" && "thumb-ph")}>
        {row.kind === "running" ? (
          <span className="orb run" aria-hidden="true"><i /><i /><i /></span>
        ) : row.kind === "photo" ? (
          row.image ? <img src={row.image.src} alt={row.image.alt} /> : <SutaeruIcon name="image" signal={false} className="ico" />
        ) : (
          <SutaeruIcon name={row.kind === "stopped" ? "pause" : "check"} signal={false} className="ico" />
        )}
      </span>
      <span className="tx">
        <b>{row.title}</b>
        {row.kind === "running" && (
          <span className="sub">
            <CanvasBar progress={row.progress ?? 0} converge />
            <span className="mono ink tnum">{percent}%</span>
          </span>
        )}
        {row.tag && (
          <span className="sub"><span className={cn("tag", row.kind === "stopped" && "alert")}>{row.tag}</span></span>
        )}
      </span>
      {row.when && <span className="when">{row.when}</span>}
    </button>
  );
}

function SkeletonRows() {
  return (
    <>
      {[58, 44, 51].map((width, i) => (
        <div className="recent-row" key={i} aria-hidden="true">
          <span className="st sk" />
          <span className="tx"><span className="sk-line" style={{ width: `${width}%` }} /></span>
        </div>
      ))}
    </>
  );
}
