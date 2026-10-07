/**
 * The PWA install prompt: its rules and its state machine.
 *
 * Everything here is plain TypeScript with the window and the clock passed in,
 * so the promises the feature makes are testable without a DOM (see
 * installPrompt.test.ts for the rules and installPrompt.controller.test.ts for
 * the state machine):
 *
 *   - the card only appears once the browser has handed us a
 *     `beforeinstallprompt` event, and never while the app already runs installed;
 *   - dismissing it stays honoured for 14 days;
 *   - iOS Safari, where that event never fires, gets the manual
 *     "Share → Add to Home Screen" hint exactly once, and only when the user goes
 *     looking for an install button;
 *   - `appinstalled` retires the card without a reload.
 */

export const DISMISSAL_KEY = "sutaeru.install-dismissed";
export const IOS_HINT_KEY = "sutaeru.ios-hint-shown";
export const DISMISSAL_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export type InstallPromptOutcome = "accepted" | "dismissed";

/** The event Chrome/Edge fire before an A2HS install; iOS Safari never fires it. */
export type BeforeInstallPromptEvent = Event & {
  /**
   * Current Chrome resolves this with the user's choice; older builds resolve
   * `undefined` here and only expose the promise on `userChoice`.
   */
  prompt: () => Promise<
    | { outcome?: InstallPromptOutcome; userChoice?: Promise<{ outcome?: InstallPromptOutcome }> }
    | void
  >;
  userChoice?: Promise<{ outcome?: InstallPromptOutcome }>;
};

/** `localStorage`-shaped reader/writer, or nothing when storage is unavailable. */
export type MaybeStorage =
  | { getItem: (key: string) => string | null; setItem?: (key: string, value: string) => void }
  | null
  | undefined;

/** The smallest slice of `window` this module needs. */
export type InstallPromptWindow = {
  addEventListener: (type: string, handler: (event: Event) => void) => void;
  removeEventListener: (type: string, handler: (event: Event) => void) => void;
  matchMedia: (query: string) => { matches: boolean };
  navigator: { userAgent: string; maxTouchPoints?: number; standalone?: boolean };
  localStorage?: MaybeStorage;
  MSStream?: unknown;
};

function read(storage: MaybeStorage, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    // Safari in private mode throws on read; treat it as "nothing stored".
    return null;
  }
}

function write(storage: MaybeStorage, key: string, value: string): void {
  try {
    storage?.setItem?.(key, value);
  } catch {
    /* storage blocked or full: the prompt still works for this visit */
  }
}

/** When the card was last dismissed, or `null` if there is no usable record. */
export function readDismissalAt(storage: MaybeStorage): number | null {
  const stored = read(storage, DISMISSAL_KEY);
  if (!stored) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return null;
  }
  const timestamp = (parsed as { timestamp?: unknown } | null)?.timestamp;
  return typeof timestamp === "number" && Number.isFinite(timestamp) ? timestamp : null;
}

export function writeDismissal(storage: MaybeStorage, now: number): void {
  write(storage, DISMISSAL_KEY, JSON.stringify({ timestamp: now }));
}

/** Any recorded value counts as "the hint has been seen". */
export function readIosHintShown(storage: MaybeStorage): boolean {
  const stored = read(storage, IOS_HINT_KEY);
  return stored !== null && stored !== "";
}

export function markIosHintShown(storage: MaybeStorage): void {
  write(storage, IOS_HINT_KEY, "true");
}

/** True while a dismissal is still inside the 14-day window. */
export function dismissalActive(dismissedAt: number | null, now: number): boolean {
  if (dismissedAt === null) return false;
  const age = now - dismissedAt;
  // A timestamp in the future is bad data, not a permanent silence.
  if (age < 0) return false;
  return age < DISMISSAL_DAYS * DAY_MS;
}

/** Already running as an installed app (home-screen icon / PWA window). */
export function isStandaloneFrom(displayModeStandalone: boolean, iosStandaloneAtom: boolean): boolean {
  return displayModeStandalone || iosStandaloneAtom;
}

/**
 * iOS Safari - the only iOS browser that can install a web app, and therefore the
 * only place the manual "Share → Add to Home Screen" hint makes sense.
 *
 * iPadOS 13+ Safari sends a desktop-class user agent ("Macintosh"), so a "Mac"
 * that reports a touch screen is an iPad. Non-Safari engines are excluded: their
 * iOS builds cannot install a web app at all.
 */
export function isIosSafariFrom(
  userAgent: string,
  maxTouchPoints: number,
  hasMsStream: boolean
): boolean {
  if (hasMsStream) return false;
  const appleDevice = /iPad|iPhone|iPod/.test(userAgent);
  const ipadOs = /Macintosh/.test(userAgent) && maxTouchPoints > 1;
  if (!appleDevice && !ipadOs) return false;
  const otherEngine = /Chrome|Android|CriOS|FxiOS|Edg|OPR|Silk/i.test(userAgent);
  return /Safari/i.test(userAgent) && !otherEngine;
}

export type InstallFacts = {
  /** `(display-mode: standalone)` matches. */
  displayModeStandalone: boolean;
  /** The legacy `navigator.standalone` atom. */
  iosStandaloneAtom: boolean;
  /** `beforeinstallprompt` fired and we still hold the event. */
  hasPromptEvent: boolean;
  /** `appinstalled` fired, or the app was installed when the page loaded. */
  installed: boolean;
  userAgent: string;
  maxTouchPoints: number;
  hasMsStream: boolean;
  dismissedAt: number | null;
  iosHintShown: boolean;
  /** The user has just opened an "install the app" affordance in this session. */
  requestingIosHint: boolean;
  now: number;
};

export type InstallDecision = { showInstall: boolean; showIosHint: boolean };

/** The single place that decides which install affordance, if any, is on screen. */
export function decideInstall(facts: InstallFacts): InstallDecision {
  const none: InstallDecision = { showInstall: false, showIosHint: false };
  if (isStandaloneFrom(facts.displayModeStandalone, facts.iosStandaloneAtom)) return none;
  if (facts.installed) return none;
  if (dismissalActive(facts.dismissedAt, facts.now)) return none;

  if (facts.hasPromptEvent) {
    return { showInstall: true, showIosHint: false };
  }
  // iOS never fires `beforeinstallprompt`, so the manual instructions are offered
  // only when the user actually goes looking for an install button - and only once
  // per device.
  if (facts.requestingIosHint && isIosSafariFrom(facts.userAgent, facts.maxTouchPoints, facts.hasMsStream)) {
    return { showInstall: false, showIosHint: !facts.iosHintShown };
  }
  return none;
}

/** Reads the facts a browser exposes right now. */
export function collectInstallFacts(
  win: InstallPromptWindow | null | undefined,
  extra: {
    hasPromptEvent: boolean;
    installed: boolean;
    dismissedAt: number | null;
    iosHintShown: boolean;
    requestingIosHint: boolean;
  },
  now: number
): InstallFacts {
  if (!win) {
    return {
      displayModeStandalone: false,
      iosStandaloneAtom: false,
      hasPromptEvent: false,
      installed: true,
      userAgent: "",
      maxTouchPoints: 0,
      hasMsStream: false,
      dismissedAt: null,
      iosHintShown: true,
      requestingIosHint: false,
      now,
    };
  }
  return {
    displayModeStandalone: win.matchMedia("(display-mode: standalone)").matches,
    iosStandaloneAtom: win.navigator.standalone === true,
    hasPromptEvent: extra.hasPromptEvent,
    installed: extra.installed,
    userAgent: win.navigator.userAgent,
    maxTouchPoints: win.navigator.maxTouchPoints ?? 0,
    hasMsStream: win.MSStream !== undefined,
    dismissedAt: extra.dismissedAt,
    iosHintShown: extra.iosHintShown,
    requestingIosHint: extra.requestingIosHint,
    now,
  };
}

export type InstallPromptState = {
  canInstall: boolean;
  isStandalone: boolean;
  showIosHint: boolean;
};

/**
 * The install prompt's whole lifecycle, with `window` injected. `useInstallPrompt`
 * is a thin React binding over this; the listeners, the 14-day write and the
 * once-only iOS hint all live here.
 */
export class InstallPromptController {
  private promptEvent: BeforeInstallPromptEvent | null = null;
  private installed: boolean;
  private dismissedAt: number | null;
  private iosHintRecorded: boolean;
  private hintRequested = false;
  private hintVisible = false;
  private state: InstallPromptState;
  private listeners = new Set<() => void>();

  constructor(
    private win: InstallPromptWindow | null | undefined,
    private clock: () => number = () => Date.now()
  ) {
    this.dismissedAt = readDismissalAt(win?.localStorage);
    this.iosHintRecorded = readIosHintShown(win?.localStorage);
    this.installed = isStandaloneFrom(
      win ? win.matchMedia("(display-mode: standalone)").matches : false,
      win ? win.navigator.standalone === true : false
    );
    this.state = this.sync();
  }

  /** Registers the browser listeners; returns the detach function. */
  attach(): () => void {
    if (!this.win) return () => undefined;
    const onBeforeInstallPrompt = (event: Event) => {
      // Holding on to the event is what makes the install button work later;
      // without preventDefault() the browser shows its own prompt instead.
      event.preventDefault();
      this.promptEvent = event as BeforeInstallPromptEvent;
      this.refresh();
    };
    const onAppInstalled = () => {
      this.promptEvent = null;
      this.installed = true;
      this.hintVisible = false;
      this.refresh();
    };
    // iOS has no install event to hook, so the manual instructions appear when
    // something asks for them: the browser's own "Add to Home Screen" gesture where
    // it is exposed (`before-app-install`), or an in-app menu dispatching
    // `sutaeru:ios-hint-request`. Asking again must not bring back instructions the
    // user has already closed - that is what "once per device" means.
    const onRequestIosHint = () => {
      this.hintRequested = true;
      this.refresh();
    };
    this.win.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    this.win.addEventListener("appinstalled", onAppInstalled);
    this.win.addEventListener("before-app-install", onRequestIosHint);
    this.win.addEventListener("sutaeru:ios-hint-request", onRequestIosHint);
    return () => {
      this.win?.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      this.win?.removeEventListener("appinstalled", onAppInstalled);
      this.win?.removeEventListener("before-app-install", onRequestIosHint);
      this.win?.removeEventListener("sutaeru:ios-hint-request", onRequestIosHint);
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Stable object identity until something actually changes. */
  getState = (): InstallPromptState => this.state;

  /**
   * Applies the rules to the current facts. Reaching `showIosHint: true` latches
   * the hint for this session and records it as seen, which is what makes it a
   * one-time hint rather than a per-visit nag.
   */
  private sync(): InstallPromptState {
    const facts = collectInstallFacts(
      this.win,
      {
        hasPromptEvent: this.promptEvent !== null,
        installed: this.installed,
        dismissedAt: this.dismissedAt,
        iosHintShown: this.iosHintRecorded,
        requestingIosHint: this.hintRequested,
      },
      this.clock()
    );
    const decision = decideInstall(facts);
    if (decision.showIosHint) {
      // Latch it: `decideInstall` drops the hint as soon as it is recorded as
      // seen, but the card has to stay up until the user closes it.
      this.hintVisible = true;
      if (!this.iosHintRecorded) {
        this.iosHintRecorded = true;
        markIosHintShown(this.win?.localStorage);
      }
    }
    return {
      canInstall: decision.showInstall,
      isStandalone:
        facts.installed || isStandaloneFrom(facts.displayModeStandalone, facts.iosStandaloneAtom),
      showIosHint: this.hintVisible,
    };
  }

  private refresh(): void {
    const next = this.sync();
    const previous = this.state;
    if (
      next.canInstall === previous.canInstall &&
      next.isStandalone === previous.isStandalone &&
      next.showIosHint === previous.showIosHint
    ) {
      return;
    }
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  /** Shows the browser's install dialog. Resolves true when the user accepts. */
  async install(): Promise<boolean> {
    const event = this.promptEvent;
    if (!event) return false;
    let outcome: InstallPromptOutcome = "dismissed";
    try {
      const prompted = await event.prompt();
      const choice = await (prompted?.userChoice ?? event.userChoice);
      outcome = choice?.outcome ?? prompted?.outcome ?? "dismissed";
    } catch {
      // Older WebKit throws instead of resolving a choice. That's a browser
      // failure, not a decision by the user, so the card goes away but no
      // dismissal is recorded and the offer comes back next visit.
      this.promptEvent = null;
      this.refresh();
      return false;
    }
    if (outcome === "accepted") {
      // The browser now owns the flow; the card is done, and `appinstalled`
      // confirms it. Recording a dismissal keeps the card out of the way if the
      // install itself takes a while.
      this.promptEvent = null;
      this.dismissedAt = this.clock();
      writeDismissal(this.win?.localStorage, this.dismissedAt);
      this.refresh();
      return true;
    }
    // Cancelled at the browser's own dialog: honour it like closing the card.
    this.dismiss();
    return false;
  }

  dismiss(): void {
    const now = this.clock();
    this.promptEvent = null;
    this.dismissedAt = now;
    writeDismissal(this.win?.localStorage, now);
    this.refresh();
  }

  dismissIosHint(): void {
    this.hintVisible = false;
    this.refresh();
  }
}
