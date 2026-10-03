import type { SVGProps } from "react";

import { cn } from "@/lib/utils";

export type SutaeruIconName =
  | "search"
  | "research"
  | "ask"
  | "report"
  | "web"
  | "agent"
  | "memory"
  | "schedule"
  | "files"
  | "models"
  | "make"
  | "home"
  | "connections"
  | "settings"
  | "close"
  | "check"
  | "plus"
  | "arrow"
  | "more"
  | "delete"
  | "edit"
  | "copy"
  | "download"
  | "share"
  | "pin"
  | "lock"
  | "play"
  | "voice"
  | "bookmark"
  | "image"
  | "video"
  | "code"
  | "review"
  | "admin"
  | "plan";

type SutaeruIconProps = SVGProps<SVGSVGElement> & {
  name: SutaeruIconName;
  signal?: boolean;
};

const paths: Record<SutaeruIconName, React.ReactNode> = {
  search: <><circle cx="42" cy="40" r="18" /><path d="m55 53 15 15" /></>,
  research: <><path d="m20 34 28-15 28 15-28 15-28-15Z" /><path d="m28 46 20 11 20-11M28 57l20 11 20-11" /></>,
  ask: <><path d="M27 24h42a8 8 0 0 1 8 8v21a8 8 0 0 1-8 8H47L33 73V61h-6a8 8 0 0 1-8-8V32a8 8 0 0 1 8-8Z" /></>,
  report: <><path d="M30 15h29l12 12v52H30V15Z" /><path d="M59 15v13h12M42 43h18M42 55h18" /></>,
  web: <><circle cx="48" cy="48" r="31" /><path d="M17 48h62M48 17c12 11 16 21 16 31S60 68 48 79M48 17C36 28 32 38 32 48s4 20 16 31" /></>,
  agent: <><path d="M48 17c18 0 29 13 29 31v25H19V48c0-18 11-31 29-31Z" /><circle cx="48" cy="47" r="14" /><path d="M32 73V62M64 73V62" /></>,
  memory: <><ellipse cx="48" cy="23" rx="24" ry="9" /><path d="M24 23v47c0 5 11 9 24 9s24-4 24-9V23M24 46c0 5 11 9 24 9s24-4 24-9" /></>,
  schedule: <><rect x="18" y="24" width="60" height="54" rx="7" /><path d="M18 40h60M33 17v14M63 17v14" /></>,
  files: <><path d="M15 31h25l7 8h34v37H15V31Z" /></>,
  models: <><path d="M20 27h56M20 48h56M20 69h56" /><circle cx="36" cy="27" r="7" /><circle cx="61" cy="48" r="7" /><circle cx="43" cy="69" r="7" /></>,
  make: <><path d="M48 13c2 20 10 31 26 35-16 4-24 15-26 35-2-20-10-31-26-35 16-4 24-15 26-35Z" /></>,
  home: <><path d="m17 43 31-27 31 27M25 38v40h46V38" /></>,
  connections: <><circle cx="28" cy="48" r="12" /><circle cx="68" cy="27" r="12" /><circle cx="68" cy="69" r="12" /><path d="m39 42 17-9M39 54l17 9" /></>,
  settings: <><circle cx="48" cy="48" r="13" /><path d="M48 14v10M48 72v10M14 48h10M72 48h10M24 24l7 7M65 65l7 7M72 24l-7 7M31 65l-7 7" /></>,
  close: <><path d="m27 27 42 42M69 27 27 69" /></>,
  check: <><path d="m22 50 17 17 36-39" /></>,
  plus: <><path d="M48 20v56M20 48h56" /></>,
  arrow: <><path d="M18 48h56M55 28l20 20-20 20" /></>,
  more: <><circle cx="24" cy="48" r="3" /><circle cx="48" cy="48" r="3" /><circle cx="72" cy="48" r="3" /></>,
  delete: <><path d="M25 30h46M38 30V20h20v10M31 30l4 48h26l4-48M43 42v24M53 42v24" /></>,
  edit: <><path d="M24 67l4-18 32-32 14 14-32 32-18 4ZM54 23l14 14" /></>,
  copy: <><rect x="28" y="28" width="46" height="50" rx="6" /><path d="M22 66h-4V18h44v4" /></>,
  download: <><path d="M48 16v43M31 43l17 17 17-17M20 75h56" /></>,
  share: <><path d="M41 30h-17v48h48V60M48 48l27-27M55 21h20v20" /></>,
  pin: <><path d="m30 20 36 36M58 18l20 20-13 6-14 14-6 13-20-20 13-6 14-14 6-13ZM38 58 18 78" /></>,
  lock: <><rect x="23" y="42" width="50" height="37" rx="6" /><path d="M33 42V31a15 15 0 0 1 30 0v11M48 57v10" /></>,
  play: <><circle cx="48" cy="48" r="31" /><path d="m41 34 22 14-22 14V34Z" /></>,
  voice: <><rect x="36" y="17" width="24" height="42" rx="12" /><path d="M26 47a22 22 0 0 0 44 0M48 69v12M36 81h24" /></>,
  bookmark: <><path d="M27 17h42v64L48 67 27 81V17Z" /></>,
  image: <><rect x="17" y="21" width="62" height="54" rx="7" /><circle cx="36" cy="39" r="7" /><path d="m20 68 18-17 12 11 10-9 16 15" /></>,
  video: <><rect x="18" y="24" width="44" height="48" rx="8" /><path d="m62 38 16-10v40l-16-10" /></>,
  code: <><path d="m36 27-20 21 20 21M60 27l20 21-20 21M55 18 41 78" /></>,
  review: <><path d="M26 20h44v59H26V20ZM37 36l5 5 9-10M37 56l5 5 9-10M57 38h6M57 58h6" /></>,
  admin: <><path d="M48 14 76 25v20c0 18-11 29-28 37-17-8-28-19-28-37V25l28-11Z" /><path d="m34 48 9 9 19-20" /></>,
  plan: <><path d="M18 24h60v48H18V24Z" /><path d="M18 40h60M39 40v32M28 32h2M36 32h2M56 52h12M56 61h8" /></>,
};

const signals: Partial<Record<SutaeruIconName, [number, number]>> = {
  search: [42, 40], research: [48, 34], ask: [55, 42], report: [48, 63],
  web: [48, 48], agent: [57, 42], memory: [48, 67], schedule: [58, 59],
  files: [51, 54], models: [61, 48], make: [70, 31], home: [56, 58],
  connections: [68, 48], settings: [48, 48],
  close: [69, 27], check: [75, 28], plus: [48, 48], arrow: [74, 48], more: [72, 48],
  delete: [65, 30], edit: [68, 24], copy: [67, 34], download: [48, 59], share: [75, 21],
  pin: [65, 44], lock: [48, 58], play: [48, 48], voice: [48, 34], bookmark: [48, 67],
  image: [66, 68], video: [40, 48], code: [48, 48], review: [42, 41], admin: [48, 48], plan: [68, 60],
};

/** Sutaeru's heavy rounded icon family with one orange signal per symbol. */
export function SutaeruIcon({ name, signal = true, className, ...props }: SutaeruIconProps) {
  const dot = signals[name];
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("sutaeru-feature-icon", className)}
      {...props}
    >
      {paths[name]}
      {signal && dot ? <circle cx={dot[0]} cy={dot[1]} r="4.5" className="sutaeru-icon-signal" /> : null}
    </svg>
  );
}

export default SutaeruIcon;