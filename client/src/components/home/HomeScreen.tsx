import * as React from "react";
import { useRef, type ReactNode } from "react";
import { HalftoneRamp } from "@/components/art";
import { useReducedMotion } from "@/components/art/useMotion";
import { SutaeruGlyph, SutaeruSeal } from "@/components/brand";
import { cn } from "@/lib/utils";
import { HomeComposer, type HomeComposerProps } from "./HomeComposer";
import { useKeyboardInset } from "./useKeyboardInset";
import { useRampEnergy } from "./useRampEnergy";

export interface HomeScreenProps {
  composer: HomeComposerProps;
  /** First visit: the loop draws, the seal is pressed. */
  intro?: boolean;
  /** A recording is open, which drives the ramp and the meter. */
  listening?: boolean;
  /** Offline and error banners, between the hero and the composer. */
  banners?: ReactNode;
}

/**
 * Home, the screen the prototype draws in `VIEWS.home` (design/sutaeru-app/app.js:511-563),
 * cut down to what the owner kept: mark, wordmark, tagline, dot ramp and the composer.
 * Past chats live in the logo menu, so there is no list here. Presentational only.
 */
export function HomeScreen({ composer, intro, listening, banners }: HomeScreenProps) {
  const heroRef = useRef<HTMLDivElement | null>(null);
  const pulse = useRampEnergy(heroRef, !!listening);
  useKeyboardInset();
  // The prototype skips the intro under reduced motion as surely as on a second visit.
  const reducedMotion = useReducedMotion();
  const showIntro = !!intro && !reducedMotion;

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

      {banners && <div className="home-banners">{banners}</div>}

      <div className="home-dock">
        <HomeComposer {...composer} onActivity={pulse} />
      </div>
    </section>
  );
}
