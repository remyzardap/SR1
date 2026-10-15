import * as React from "react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export interface HomeModeCard {
  key: string;
  label: string;
  idx: string;
  img: string;
  hint: string;
  path: string;
  live?: boolean;
}

export const DEFAULT_HOME_MODES: HomeModeCard[] = [
  { key: "chat", label: "Chat", idx: "01", img: "/studio/o/nav-chat.webp", hint: "Ask anything", path: "/chat" },
  { key: "agent", label: "Agent", idx: "02", img: "/studio/o/nav-agent.webp", hint: "Hand it a job", path: "/chat?mode=agent", live: true },
  { key: "studio", label: "Studio", idx: "03", img: "/studio/o/nav-images.webp", hint: "Describe an image", path: "/images" },
  { key: "docs", label: "Docs", idx: "04", img: "/studio/o/nav-documents.webp", hint: "Start a document", path: "/documents" },
  { key: "video", label: "Video", idx: "05", img: "/studio/o/nav-video.webp", hint: "Describe a scene", path: "/video" },
  { key: "files", label: "Files", idx: "06", img: "/studio/o/nav-files.webp", hint: "Find a file", path: "/files" },
];

export interface HomeScreenComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  onAddAttachment?: (kind: "file" | "camera" | "drive") => void;
  onRemoveAttachment?: (id: string) => void;
  attachments?: Array<{ id: string; name: string; preview?: string; meta?: string }>;
  listening?: boolean;
  onListen?: () => void;
  onStopListen?: () => void;
  offline?: boolean;
  placeholder?: string;
  privateChat?: boolean;
}

export interface HomeScreenProps {
  modes?: HomeModeCard[];
  activeModeIndex?: number;
  onSelectMode?: (index: number) => void;
  userInitial?: string;
  onOpenMenu?: () => void;
  onAccountClick?: () => void;
  composer: HomeScreenComposerProps;
  banners?: React.ReactNode;
  intro?: boolean;
  listening?: boolean;
}

/**
 * Presentational Sutaeru seal stamp (スタエル) in vermilion red accent.
 */
export function SutaeruJapaneseSeal({ size = 21, className }: { size?: number; className?: string }) {
  const maskId = useId().replace(/:/g, "_");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="スタエル"
      className={className}
      style={{ display: "block", flex: "none" }}
    >
      <defs>
        <mask id={maskId}>
          <rect width="100" height="100" fill="#fff" />
          <g fill="#000">
            <path
              d="M575 530Q675 566 753.5 622.5Q832 679 832 741Q832 775 812 794Q792 813 767 813Q746 813 729 797.5Q712 782 701 754Q677 694 638 640Q599 586 555 551Q469 646 356.5 719.5Q244 793 81 856Q75 858 71 858Q65 858 65 854Q65 849 77 842Q182 784 285.5 693Q389 602 466.5 504Q544 406 573 329Q577 318 577 312Q577 307 572 307Q562 307 497.5 326Q433 345 391 363L371 373Q361 378 351.5 382Q342 386 334 386Q309 386 281 363.5Q253 341 234 310Q215 279 215 255Q215 248 217 243.5Q219 239 222 239Q225 239 233 247.5Q241 256 250 261Q278 278 318 278Q346 278 576 237Q591 234 614 217Q616 216 625 209.5Q634 203 641 203Q656 203 684 222Q712 241 734 265Q756 289 756 304Q756 312 750 318.5Q744 325 729 337Q702 357 692 373Q631 464 575 530"
              transform="translate(52 7) scale(0.0392)"
            />
            <path
              d="M750 172Q763 172 790.5 190Q818 208 840.5 230.5Q863 253 863 265Q863 276 857.5 281.5Q852 287 839 296Q823 306 810.5 317Q798 328 786 348Q727 448 660 532Q752 602 752 664Q752 695 733.5 713.5Q715 732 692 732Q673 732 655.5 717.5Q638 703 625 681Q601 639 585 614Q391 810 117 884Q104 888 98 888Q91 888 91 883Q91 879 111 869Q237 809 340.5 720.5Q444 632 525 531Q505 507 473 476.5Q441 446 402 410Q396 405 396 402Q396 398 401 398Q405 398 411 400Q496 433 568 473Q617 404 648.5 346Q680 288 680 276Q680 270 673 270Q666 270 637.5 276Q609 282 571 282Q526 282 495 275Q429 369 326.5 462Q224 555 136 592L128 594Q122 594 122 590Q122 585 135 574Q192 524 249.5 452.5Q307 381 347.5 308.5Q388 236 399 183Q402 169 402 157Q402 117 378 114Q374 114 361 113Q348 112 348 107Q348 99 371 89Q394 79 407 79Q432 79 468.5 96Q505 113 532 135.5Q559 158 559 173Q559 182 546 195Q535 208 534 211Q526 227 521 235Q526 236 538 236Q576 236 622.5 225.5Q669 215 693 205Q706 199 719 188Q726 182 734.5 177Q743 172 750 172"
              transform="translate(52 51) scale(0.0392)"
            />
            <path
              d="M806 588Q826 588 857.5 603.5Q889 619 912.5 641.5Q936 664 936 685Q936 705 919 718Q902 731 881 731Q871 731 862 728Q762 696 647 696Q583 696 510 706Q426 717 300 742Q283 745 250 756Q229 763 219 763Q183 763 148 737Q113 711 90 678Q67 645 67 629Q67 623 73 623Q81 623 100 633Q140 654 189 654Q209 654 319 641Q353 638 383 635Q413 632 439 629Q449 537 449 475Q449 434 443 419Q440 411 434 404L387 414Q361 419 335 430Q313 439 302 439Q273 439 240 408Q207 377 189 343Q179 326 179 319Q179 314 184 314Q186 314 199 319Q234 332 286 332Q332 332 443.5 318.5Q555 305 590 293Q610 285 615 283Q657 266 678 266Q697 266 724 280.5Q751 295 771.5 314Q792 333 792 345Q792 355 780.5 362Q769 369 751 369L727 368Q655 368 533 387Q581 413 581 437Q581 443 573.5 454Q566 465 562 476Q556 492 549 534.5Q542 577 537 619L575 616Q643 609 673 608Q699 607 741 599L764 594Q798 588 806 588"
              transform="translate(8 7) scale(0.0392)"
            />
            <path
              d="M547 756Q514 756 486 719Q459 682 459 657Q459 651 461 643Q473 610 476 581Q477 571 477 549L477 517Q477 499 480 418Q482 378 482 367Q482 328 471 308Q457 282 440.5 274.5Q424 267 424 265Q424 258 441 252Q458 246 480 246Q501 246 533 256Q565 266 588.5 284.5Q612 303 612 327Q612 336 608 347Q604 358 598 370Q576 416 570 457Q562 510 559.5 536Q557 562 557 596Q557 602 557.5 606.5Q558 611 561 611Q575 611 631 584.5Q687 558 769.5 503Q852 448 943 365Q958 351 964 351Q966 351 966 354Q966 361 954 379Q884 487 822 547.5Q760 608 681 666Q622 711 600 731Q574 756 547 756M34 865Q28 865 28 860Q28 854 37 847Q134 764 200.5 651Q267 538 286 415Q290 395 290 380Q290 335 253 310Q249 307 242 303.5Q235 300 235 298Q235 294 245.5 290.5Q256 287 275 287Q298 287 318 294Q373 312 399.5 334.5Q426 357 426 375Q426 384 421 392Q416 400 415 402Q398 425 389 458Q357 572 301.5 651Q246 730 183 777Q120 824 45 861Q37 865 34 865"
              transform="translate(8 51) scale(0.0392)"
            />
          </g>
        </mask>
      </defs>
      <g>
        <rect x="2" y="2" width="96" height="96" rx="9" fill="var(--accent, #F4511E)" mask={`url(#${maskId})`} />
      </g>
    </svg>
  );
}

/**
 * Sutaeru twin-lenses and torii gate mark for the header.
 */
export function SutaeruHeaderMark({ width = 44, height = 23 }: { width?: number; height?: number }) {
  const clipId = useId().replace(/:/g, "_");
  return (
    <svg width={width} height={height} style={{ display: "block" }} viewBox="0 0 144 76" fill="none" aria-hidden="true">
      <path
        d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z"
        pathLength="1"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinejoin="round"
      />
      <g transform="translate(108 39) scale(.9) translate(-108 -39)">
        <clipPath id={clipId}>
          <rect x="84" y="10" width="48" height="50.2" />
        </clipPath>
        <g clipPath={`url(#${clipId})`}>
          <circle cx="108" cy="46.4" r="6.3" fill="var(--accent, #F4511E)" />
        </g>
        <g fill="currentColor">
          <path d="M89.2 21.4L90.5 22.5Q108 27.1 125.5 22.5L126.8 21.4L126.2 25.0Q108 29.9 89.8 25.0Z" />
          <path d="M91.6 26.7Q108 30.7 124.4 26.7L124.2 28.9Q108 32.9 91.8 28.9Z" />
          <path d="M106.7 30.4H109.3V35.2H106.7Z" />
          <path d="M90.6 35.1H125.4V37.7H90.6Z" />
          <path d="M95.8 27.6H99.6L98.6 57.6H94.4ZM116.4 27.6H120.2L121.6 57.6H117.4Z" />
        </g>
        <g strokeLinecap="round">
          <path d="M91.6 60.6H103.2M112.8 60.6H124.4" stroke="currentColor" strokeWidth="1.7" />
        </g>
        <g strokeLinecap="round">
          <path d="M104.8 60.6H111.2" stroke="var(--accent, #F4511E)" strokeWidth="1.7" />
          <path d="M106.3 63.8H109.7" stroke="var(--accent, #F4511E)" strokeWidth="1.5" />
        </g>
      </g>
    </svg>
  );
}

/**
 * Animated main center Sutaeru symbol (104x55) from Main.dc.html.
 */
export function SutaeruCenterMark() {
  const blurId = useId().replace(/:/g, "_");
  const sunId = useId().replace(/:/g, "_");
  const haloId = useId().replace(/:/g, "_");
  const seaId = useId().replace(/:/g, "_");
  const sweepId = useId().replace(/:/g, "_");
  const maskId = useId().replace(/:/g, "_");

  return (
    <span style={{ display: "block", filter: "drop-shadow(0 10px 24px rgba(0,0,0,.25))" }}>
      <svg role="img" aria-label="Sutaeru" width="104" height="55" viewBox="0 0 144 76" fill="none" style={{ display: "block", overflow: "visible" }}>
        <defs>
          <filter id={blurId} x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
          <radialGradient id={sunId} cx="38%" cy="32%" r="75%">
            <stop offset="0" stopColor="#FFB089" />
            <stop offset=".55" stopColor="#F4511E" />
            <stop offset="1" stopColor="#C93C0E" />
          </radialGradient>
          <radialGradient id={haloId}>
            <stop offset="0" stopColor="#F4511E" stopOpacity=".8" />
            <stop offset="1" stopColor="#F4511E" stopOpacity="0" />
          </radialGradient>
          <clipPath id={seaId}>
            <rect x="84" y="4" width="48" height="56.2" />
          </clipPath>
          <linearGradient id={sweepId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".5" stopColor="#fff" stopOpacity=".75" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="-10" y="-10" width="170" height="100">
            <path
              d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z"
              stroke="#fff"
              strokeWidth="9"
              strokeLinejoin="round"
            />
          </mask>
        </defs>
        <path
          d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z"
          pathLength="100"
          stroke="var(--ink)"
          strokeWidth="9"
          strokeLinejoin="round"
          className="si-a"
          style={{ transformBox: "fill-box", transformOrigin: "center", animationName: "siDrawL", animationTimingFunction: "cubic-bezier(.55,0,.25,1)" }}
        />
        <path
          d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z"
          pathLength="100"
          stroke="var(--ink)"
          strokeWidth="9"
          strokeLinejoin="round"
          className="si-a"
          style={{ transformBox: "fill-box", transformOrigin: "center", animationName: "siDrawR", animationTimingFunction: "cubic-bezier(.55,0,.25,1)" }}
        />
        <g filter={`url(#${blurId})`}>
          <path
            d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z"
            pathLength="100"
            stroke="#F4511E"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray="2 98"
            className="si-a"
            style={{ transformBox: "fill-box", transformOrigin: "center", animationName: "siHeadL", animationTimingFunction: "cubic-bezier(.55,0,.25,1)" }}
          />
          <path
            d="M72 38C64 18 52 8 36 8C19 8 8 20 8 38s11 30 28 30c16 0 28-10 36-30C80 18 92 8 108 8c17 0 28 12 28 30s-11 30-28 30c-16 0-28-10-36-30Z"
            pathLength="100"
            stroke="#F4511E"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray="2 98"
            className="si-a"
            style={{ transformBox: "fill-box", transformOrigin: "center", animationName: "siHeadR", animationTimingFunction: "cubic-bezier(.55,0,.25,1)" }}
          />
        </g>
        <g transform="translate(108 39) scale(.9) translate(-108 -39)">
          <g clipPath={`url(#${seaId})`}>
            <circle cx="108" cy="46.4" r="15" fill={`url(#${haloId})`} className="si-a" style={{ transformBox: "fill-box", transformOrigin: "center", animationName: "siHalo", animationTimingFunction: "ease-out" }} />
            <circle cx="108" cy="46.4" r="6.3" fill={`url(#${sunId})`} className="si-a" style={{ transformBox: "fill-box", transformOrigin: "center", animationName: "siSun", animationTimingFunction: "cubic-bezier(.2,.8,.2,1)" }} />
            <g fill="var(--ink)" className="si-a" style={{ transformBox: "fill-box", transformOrigin: "center", animationName: "siGate", animationTimingFunction: "cubic-bezier(.2,.8,.2,1)" }}>
              <path d="M89.2 21.4L90.5 22.5Q108 27.1 125.5 22.5L126.8 21.4L126.2 25.0Q108 29.9 89.8 25.0Z" />
              <path d="M91.6 26.7Q108 30.7 124.4 26.7L124.2 28.9Q108 32.9 91.8 28.9Z" />
              <path d="M106.7 30.4H109.3V35.2H106.7Z" />
              <path d="M90.6 35.1H125.4V37.7H90.6Z" />
              <path d="M95.8 27.6H99.6L98.6 57.6H94.4ZM116.4 27.6H120.2L121.6 57.6H117.4Z" />
            </g>
          </g>
          <path d="M91.6 60.6H103.2M112.8 60.6H124.4" stroke="var(--ink)" strokeWidth="1.7" strokeLinecap="round" className="si-a" style={{ transformBox: "fill-box", transformOrigin: "center", animationName: "siSea", animationTimingFunction: "cubic-bezier(.2,.8,.2,1)" }} />
          <g stroke="#F4511E" strokeLinecap="round" className="si-a" style={{ transformBox: "fill-box", transformOrigin: "center", animationName: "siGlint", animationTimingFunction: "cubic-bezier(.2,.8,.2,1)" }}>
            <path d="M104.8 60.6H111.2" strokeWidth="1.7" />
            <path d="M106.3 63.8H109.7" strokeWidth="1.5" />
          </g>
        </g>
        <g mask={`url(#${maskId})`}>
          <rect x="-40" y="-6" width="34" height="88" fill={`url(#${sweepId})`} transform="skewX(-18)" className="si-a" style={{ transformBox: "view-box", transformOrigin: "0 0", animationName: "siSweep", animationTimingFunction: "cubic-bezier(.4,0,.2,1)" }} />
        </g>
      </svg>
    </span>
  );
}

/**
 * Presentational Floating Artifacts Hero: 3 tilted cards representing Sutaeru outputs.
 */
export function FloatingArtifactsHero() {
  return (
    <section aria-label="What Sutaeru is making" role="img" className="q-hero">
      <div aria-hidden="true" className="q-hero-dots" />
      <div aria-hidden="true" className="q-hero-glow" />

      {/* Left card: Villa build budget BOQ */}
      <div className="hfCard hfCard-left">
        <div style={{ width: 178, height: 226, padding: "14px 14px 0", background: "#fff", borderRadius: 10, boxShadow: "0 1px 2px rgba(20,18,16,.18), 0 30px 60px -24px rgba(0,0,0,.7)", boxSizing: "border-box", color: "#242320", overflow: "hidden" }}>
          <span style={{ font: "500 6.5px/1 'JetBrains Mono', monospace", letterSpacing: ".16em", textTransform: "uppercase", color: "#8A8780" }}>
            Sheet · BOQ
          </span>
          <b style={{ display: "block", marginTop: 7, font: "800 13px/1.05 'Inter Tight', sans-serif", letterSpacing: "-.03em" }}>
            Villa build<br />budget
          </b>
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 6, padding: "5px 0", borderBottom: "1px solid #F0EEE9", font: "500 7px/1 Inter, sans-serif" }}>
              <span style={{ flex: 1, color: "#242320" }}>Foundations</span>
              <span style={{ width: 22, textAlign: "right", color: "#8A8780" }}>64</span>
              <span style={{ width: 30, textAlign: "right", fontWeight: 600, color: "#242320" }}>1.92m</span>
            </div>
            <div style={{ display: "flex", gap: 6, padding: "5px 0", borderBottom: "1px solid #F0EEE9", font: "500 7px/1 Inter, sans-serif" }}>
              <span style={{ flex: 1, color: "#242320" }}>Columns</span>
              <span style={{ width: 22, textAlign: "right", color: "#8A8780" }}>46</span>
              <span style={{ width: 30, textAlign: "right", fontWeight: 600, color: "#242320" }}>2.40m</span>
            </div>
            <div style={{ display: "flex", gap: 6, padding: "5px 0", borderBottom: "1px solid #F0EEE9", font: "500 7px/1 Inter, sans-serif" }}>
              <span style={{ flex: 1, color: "#242320" }}>Brick walls</span>
              <span style={{ width: 22, textAlign: "right", color: "#8A8780" }}>812</span>
              <span style={{ width: 30, textAlign: "right", fontWeight: 600, color: "#242320" }}>185k</span>
            </div>
            <div style={{ display: "flex", gap: 6, padding: "5px 8px", margin: "0 -8px", background: "rgba(244,81,30,.08)", borderBottom: "1px solid #F0EEE9", font: "500 7px/1 Inter, sans-serif" }}>
              <span style={{ flex: 1, color: "#242320" }}>Roof</span>
              <span style={{ width: 22, textAlign: "right", color: "#8A8780" }}>238</span>
              <span style={{ width: 30, textAlign: "right", fontWeight: 600, color: "#F4511E" }}>640k</span>
            </div>
            <div style={{ display: "flex", gap: 6, padding: "5px 0", borderBottom: "1px solid #F0EEE9", font: "500 7px/1 Inter, sans-serif" }}>
              <span style={{ flex: 1, color: "#242320" }}>Floor tiles</span>
              <span style={{ width: 22, textAlign: "right", color: "#8A8780" }}>420</span>
              <span style={{ width: 30, textAlign: "right", fontWeight: 600, color: "#242320" }}>31k</span>
            </div>
            <div style={{ display: "flex", gap: 6, padding: "5px 0", borderBottom: "1px solid #F0EEE9", font: "500 7px/1 Inter, sans-serif" }}>
              <span style={{ flex: 1, color: "#242320" }}>Plumbing</span>
              <span style={{ width: 22, textAlign: "right", color: "#8A8780" }}>1</span>
              <span style={{ width: 30, textAlign: "right", fontWeight: 600, color: "#242320" }}>180k</span>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, font: "800 9px/1 'Inter Tight', sans-serif" }}>
            <span>Total</span>
            <span>5.6m</span>
          </div>
        </div>
      </div>

      {/* Right card: Q4 pipeline deck */}
      <div className="hfCard hfCard-right">
        <div style={{ width: 178, height: 226, padding: 14, background: "#fff", borderRadius: 10, boxShadow: "0 1px 2px rgba(20,18,16,.18), 0 30px 60px -24px rgba(0,0,0,.7)", boxSizing: "border-box", color: "#242320", overflow: "hidden" }}>
          <span style={{ font: "500 6.5px/1 'JetBrains Mono', monospace", letterSpacing: ".16em", textTransform: "uppercase", color: "#8A8780" }}>
            Deck · 4 / 12
          </span>
          <b style={{ display: "block", marginTop: 8, font: "800 13px/1.05 'Inter Tight', sans-serif", letterSpacing: "-.03em" }}>
            Q4 pipeline
          </b>
          <b style={{ display: "block", marginTop: 14, font: "800 34px/1 'Inter Tight', sans-serif", letterSpacing: "-.05em" }}>
            12.4<span style={{ fontSize: 13, letterSpacing: "-.02em", marginLeft: 3 }}>MWp</span>
          </b>
          <span style={{ display: "block", marginTop: 5, font: "600 7.5px/1 Inter, sans-serif", color: "#F4511E" }}>
            +38% on Q3
          </span>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 62, marginTop: 16 }}>
            <i style={{ flex: 1, display: "block", height: "38%", borderRadius: "3px 3px 1px 1px", background: "#E9E6DF" }} />
            <i style={{ flex: 1, display: "block", height: "52%", borderRadius: "3px 3px 1px 1px", background: "#E9E6DF" }} />
            <i style={{ flex: 1, display: "block", height: "47%", borderRadius: "3px 3px 1px 1px", background: "#E9E6DF" }} />
            <i style={{ flex: 1, display: "block", height: "66%", borderRadius: "3px 3px 1px 1px", background: "#E9E6DF" }} />
            <i style={{ flex: 1, display: "block", height: "84%", borderRadius: "3px 3px 1px 1px", background: "#F4511E" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, font: "500 5.5px/1 'JetBrains Mono', monospace", letterSpacing: ".16em", textTransform: "uppercase", color: "#8A8780" }}>
            <span>Jun</span>
            <span>Oct</span>
          </div>
        </div>
      </div>

      {/* Center card: PV module supplier comparison report */}
      <div className="hfCard hfCard-center">
        <div style={{ position: "relative", width: 196, height: 254, padding: "16px 16px 0", background: "#fff", borderRadius: 10, boxShadow: "0 1px 2px rgba(20,18,16,.18), 0 30px 60px -24px rgba(0,0,0,.7)", boxSizing: "border-box", color: "#242320", overflow: "hidden" }}>
          <span style={{ font: "500 6.5px/1 'JetBrains Mono', monospace", letterSpacing: ".16em", textTransform: "uppercase", color: "#8A8780" }}>
            Research report
          </span>
          <span style={{ position: "absolute", right: 12, top: 12, display: "flex", alignItems: "center", gap: 5, padding: "4px 7px", borderRadius: 7, background: "#F4F2EC", font: "500 5.5px/1 'JetBrains Mono', monospace", letterSpacing: ".16em", textTransform: "uppercase", color: "#242320" }}>
            <i className="hfBlink" style={{ display: "block", width: 5, height: 5, borderRadius: "50%", background: "#F4511E" }} />
            Writing
          </span>
          <b style={{ display: "block", marginTop: 8, font: "800 17px/1.02 'Inter Tight', sans-serif", letterSpacing: "-.035em" }}>
            PV module<br />supplier comparison
          </b>
          <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
            <div>
              <span style={{ font: "500 5.5px/1 'JetBrains Mono', monospace", letterSpacing: ".16em", textTransform: "uppercase", color: "#8A8780" }}>Suppliers</span>
              <b style={{ display: "block", marginTop: 4, font: "800 14px/1 'Inter Tight', sans-serif", letterSpacing: "-.03em" }}>3</b>
            </div>
            <div>
              <span style={{ font: "500 5.5px/1 'JetBrains Mono', monospace", letterSpacing: ".16em", textTransform: "uppercase", color: "#8A8780" }}>Best $/Wp</span>
              <b style={{ display: "block", marginTop: 4, font: "800 14px/1 'Inter Tight', sans-serif", letterSpacing: "-.03em" }}>0.11</b>
            </div>
            <div>
              <span style={{ font: "500 5.5px/1 'JetBrains Mono', monospace", letterSpacing: ".16em", textTransform: "uppercase", color: "#8A8780" }}>Fastest</span>
              <b style={{ display: "block", marginTop: 4, font: "800 14px/1 'Inter Tight', sans-serif", letterSpacing: "-.03em" }}>4 wk</b>
            </div>
          </div>
          <i style={{ display: "block", height: 3.5, width: "96%", marginTop: 6, borderRadius: 2, background: "#E4E1DA" }} />
          <i style={{ display: "block", height: 3.5, width: "88%", marginTop: 6, borderRadius: 2, background: "#E4E1DA" }} />
          <i style={{ display: "block", height: 3.5, width: "92%", marginTop: 6, borderRadius: 2, background: "#E4E1DA" }} />
          <i style={{ display: "block", height: 3.5, width: "64%", marginTop: 6, borderRadius: 2, background: "#E4E1DA" }} />
          <div style={{ position: "relative", marginTop: 8, height: 34, overflow: "hidden" }}>
            <i style={{ display: "block", height: 3.5, width: "90%", marginTop: 6, borderRadius: 2, background: "#E4E1DA" }} />
            <i style={{ display: "block", height: 3.5, width: "72%", marginTop: 6, borderRadius: 2, background: "#E4E1DA" }} />
            <i className="hfWrite" style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(255,255,255,0), #fff 40%)" }} />
          </div>
          <div style={{ position: "absolute", left: 16, right: 16, bottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ flex: "none", color: "#242320" }}>
              <SutaeruHeaderMark width={38} height={20} />
            </span>
            <div style={{ position: "relative", flex: 1, height: 4, borderRadius: 2, background: "#EFEDE7", overflow: "hidden" }}>
              <i style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "29.5%", borderRadius: 2, background: "linear-gradient(90deg, #242320 70%, #F4511E)" }} />
              <i style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "29.5%", borderRadius: 2, background: "linear-gradient(270deg, #242320 70%, #F4511E)" }} />
              <i className="qsheen" style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "40%", background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.7), rgba(255,255,255,0))" }} />
            </div>
            <span style={{ font: "500 6.5px/1 'JetBrains Mono', monospace", letterSpacing: ".16em", textTransform: "uppercase", color: "#242320" }}>3m</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Presentational Quiet Home Screen (matches Main.dc.html).
 */
export function HomeScreen({
  modes = DEFAULT_HOME_MODES,
  activeModeIndex = 0,
  onSelectMode,
  userInitial = "R",
  onOpenMenu,
  onAccountClick,
  composer,
  banners,
  intro,
  listening,
}: HomeScreenProps) {
  const currentMode = modes[activeModeIndex] ?? modes[0];
  const hasText = composer.value.trim().length > 0;
  const isListening = Boolean(composer.listening ?? listening);
  const placeholder =
    composer.placeholder ??
    (isListening
      ? "Listening…"
      : composer.offline
      ? "Ask now. It sends when you reconnect."
      : currentMode?.hint ?? "Ask anything");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      composer.onSubmit(composer.value);
    }
  };

  return (
    <div className={cn("home", composer.privateChat && "private-on")}>
      {/* 1. Header */}
      <header className="q-header">
        <button
          type="button"
          className="qtap q-brand-btn"
          aria-label="Open menu"
          onClick={onOpenMenu}
        >
          <SutaeruHeaderMark width={44} height={23} />
          <b className="q-brand-name">Sutaeru</b>
          <SutaeruJapaneseSeal size={21} />
        </button>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="qtap q-avatar-btn"
          aria-label="Account"
          onClick={onAccountClick}
        >
          {userInitial.charAt(0).toUpperCase()}
        </button>
      </header>

      {/* 2. Floating Artifacts Hero */}
      <FloatingArtifactsHero />

      {/* 3. Main Center Display */}
      <main className="q-main">
        <SutaeruCenterMark />

        <div className="q-badge">
          {/* Day 13 glyph */}
          <svg role="img" aria-label="13" width="37" height="24" viewBox="0 0 37.4 23.8" fill="currentColor" style={{ display: "block", overflow: "visible" }}>
            <circle cx="8.5" cy="1.7" r="1.29" />
            <circle cx="5.1" cy="5.1" r="1.29" />
            <circle cx="8.5" cy="5.1" r="1.29" />
            <circle cx="8.5" cy="8.5" r="1.29" />
            <circle cx="8.5" cy="11.9" r="1.29" />
            <circle cx="8.5" cy="15.3" r="1.29" />
            <circle cx="8.5" cy="18.7" r="1.29" />
            <circle cx="5.1" cy="22.1" r="1.29" />
            <circle cx="8.5" cy="22.1" r="1.29" />
            <circle cx="11.9" cy="22.1" r="1.29" />
            <circle cx="22.1" cy="1.7" r="1.29" />
            <circle cx="25.5" cy="1.7" r="1.29" />
            <circle cx="28.9" cy="1.7" r="1.29" />
            <circle cx="32.3" cy="1.7" r="1.29" />
            <circle cx="35.7" cy="5.1" r="1.29" />
            <circle cx="35.7" cy="8.5" r="1.29" />
            <circle cx="25.5" cy="11.9" r="1.29" />
            <circle cx="28.9" cy="11.9" r="1.29" />
            <circle cx="32.3" cy="11.9" r="1.29" />
            <circle cx="35.7" cy="15.3" r="1.29" />
            <circle cx="35.7" cy="18.7" r="1.29" />
            <circle cx="22.1" cy="22.1" r="1.29" />
            <circle cx="25.5" cy="22.1" r="1.29" />
            <circle cx="28.9" cy="22.1" r="1.29" />
            <circle cx="32.3" cy="22.1" r="1.29" />
          </svg>
          <span className="qmono" style={{ fontSize: 8.5, lineHeight: 1.25, textAlign: "left", color: "var(--quiet)" }}>
            Tue<br />Oct
          </span>
          <i aria-hidden="true" style={{ width: 1, height: 22, background: "var(--stroke)" }} />
          <span style={{ display: "block", width: 30 }}>
            <SutaeruHeaderMark width={30} height={16} />
          </span>
          {/* Number 3 glyph */}
          <svg role="img" aria-label="3" width="17" height="24" viewBox="0 0 17.0 23.8" fill="currentColor" style={{ display: "block", overflow: "visible" }}>
            <circle cx="1.7" cy="1.7" r="1.29" />
            <circle cx="5.1" cy="1.7" r="1.29" />
            <circle cx="8.5" cy="1.7" r="1.29" />
            <circle cx="11.9" cy="1.7" r="1.29" />
            <circle cx="15.3" cy="5.1" r="1.29" />
            <circle cx="15.3" cy="8.5" r="1.29" />
            <circle cx="5.1" cy="11.9" r="1.29" />
            <circle cx="8.5" cy="11.9" r="1.29" />
            <circle cx="11.9" cy="11.9" r="1.29" />
            <circle cx="15.3" cy="15.3" r="1.29" />
            <circle cx="15.3" cy="18.7" r="1.29" />
            <circle cx="1.7" cy="22.1" r="1.29" />
            <circle cx="5.1" cy="22.1" r="1.29" />
            <circle cx="8.5" cy="22.1" r="1.29" />
            <circle cx="11.9" cy="22.1" r="1.29" />
          </svg>
          <span className="qmono" style={{ fontSize: 8.5, lineHeight: 1.25, textAlign: "left", color: "var(--quiet)" }}>
            Min<br />Left
          </span>
        </div>

        <h1 className="q-headline">
          <span className="q-title-ink">What’s</span>{" "}
          <span className="q-title-quiet">next?</span>
        </h1>
      </main>

      {/* 4. Mode Cards Row */}
      <nav aria-label="Mode" className="qrow q-mode-nav">
        {modes.map((m, i) => {
          const isSelected = i === activeModeIndex;
          return (
            <button
              key={m.key}
              type="button"
              className="qtap q-mode-card-btn"
              aria-pressed={isSelected}
              onClick={() => onSelectMode?.(i)}
            >
              <span className={cn("q-mode-card", isSelected && "is-active")}>
                <img src={m.img} alt="" width="156" height="104" loading="eager" />
                <span className="qmono qidx">{m.idx}</span>
                {m.live && <i className="qlive" aria-label="Running" />}
              </span>
              <span className={cn("q-mode-label", isSelected && "is-active")}>{m.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 5. Docked Composer Footer */}
      <footer className="q-dock">
        {banners && <div className="q-dock-banners">{banners}</div>}

        {/* Attached files chips */}
        {composer.attachments && composer.attachments.length > 0 && (
          <div className="q-dock-attachments">
            {composer.attachments.map((att) => (
              <span key={att.id} className="q-dock-att-chip">
                <span>{att.name}</span>
                {att.meta && <span style={{ color: "var(--quiet)", fontSize: 10 }}>({att.meta})</span>}
                {composer.onRemoveAttachment && (
                  <button
                    type="button"
                    className="q-dock-att-remove"
                    aria-label={`Remove ${att.name}`}
                    onClick={() => composer.onRemoveAttachment?.(att.id)}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        <div className="qbar q-dock-bar">
          <button
            type="button"
            className="qtap q-dock-btn"
            aria-label="Add a file"
            onClick={() => composer.onAddAttachment?.("file")}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <label htmlFor="qAsk" className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            Message
          </label>
          <textarea
            id="qAsk"
            rows={1}
            placeholder={placeholder}
            value={composer.value}
            onChange={(e) => composer.onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="q-dock-textarea"
          />
          {(!hasText || isListening) && (
            <button
              type="button"
              className={cn("qtap q-dock-btn q-speak", isListening && "qlive-active")}
              aria-label={isListening ? "Stop listening" : "Speak"}
              onClick={isListening ? composer.onStopListen : composer.onListen}
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor" aria-hidden="true" style={{ animation: "qSwap .3s ease both" }}>
                <circle cx="3" cy="9.3" r="1.25" />
                <circle cx="3" cy="12.7" r="1.25" />
                <circle cx="7" cy="5.9" r="1.25" />
                <circle cx="7" cy="9.3" r="1.25" />
                <circle cx="7" cy="12.7" r="1.25" />
                <circle cx="7" cy="16.1" r="1.25" />
                <circle cx="11" cy="2.5" r="1.25" />
                <circle cx="11" cy="5.9" r="1.25" />
                <circle cx="11" cy="9.3" r="1.25" />
                <circle cx="11" cy="12.7" r="1.25" />
                <circle cx="11" cy="16.1" r="1.25" />
                <circle cx="11" cy="19.5" r="1.25" />
                <circle cx="15" cy="5.9" r="1.25" />
                <circle cx="15" cy="9.3" r="1.25" />
                <circle cx="15" cy="12.7" r="1.25" />
                <circle cx="15" cy="16.1" r="1.25" />
                <circle cx="19" cy="9.3" r="1.25" />
                <circle cx="19" cy="12.7" r="1.25" />
              </svg>
            </button>
          )}
          {hasText && !isListening && (
            <button
              type="button"
              className="qtap q-dock-btn q-send"
              aria-label="Send"
              onClick={() => composer.onSubmit(composer.value)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ animation: "qSwap .3s ease both" }}>
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

export default HomeScreen;
