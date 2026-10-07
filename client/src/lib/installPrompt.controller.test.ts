import { describe, expect, it, vi } from "vitest";
import {
  DISMISSAL_KEY,
  InstallPromptController,
  IOS_HINT_KEY,
  type BeforeInstallPromptEvent,
  type InstallPromptWindow,
} from "./installPrompt";

const NOW = Date.parse("2026-02-14T09:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const IPHONE_SAFARI = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  maxTouchPoints: 5,
};

type Listener = (event: unknown) => void;

type FakeWindow = InstallPromptWindow & {
  emit: (type: string, event?: unknown) => void;
  listenerTypes: () => string[];
  stored: Map<string, string>;
};

/**
 * A stand-in for `window`: it records listeners so a test can fire the very events
 * the browser fires, and keeps localStorage in a Map. The controller is written
 * against a structural window type precisely so its real behaviour - not just its
 * pure rules - can be tested without a DOM.
 */
function fakeWindow(input: {
  userAgent?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
  mediaStandalone?: boolean;
  storage?: Record<string, string>;
  storageThrows?: boolean;
} = {}): FakeWindow {
  const listeners = new Map<string, Listener[]>();
  const stored = new Map<string, string>(Object.entries(input.storage ?? {}));
  const broken = () => {
    throw new Error("SecurityError");
  };

  const win = {
    emit(type, event) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener(event);
    },
    listenerTypes() {
      return [...listeners.keys()];
    },
    stored,
    addEventListener(type: string, handler: Listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), handler]);
    },
    removeEventListener(type: string, handler: Listener) {
      listeners.set(type, (listeners.get(type) ?? []).filter((known) => known !== handler));
    },
    matchMedia: () => ({ matches: input.mediaStandalone ?? false }),
    navigator: {
      userAgent:
        input.userAgent ??
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      maxTouchPoints: input.maxTouchPoints ?? 0,
      standalone: input.standalone ?? false,
    },
    localStorage: input.storageThrows
      ? { getItem: broken, setItem: broken, removeItem: broken }
      : {
          getItem: (key: string) => stored.get(key) ?? null,
          setItem: (key: string, value: string) => {
            stored.set(key, value);
          },
          removeItem: (key: string) => {
            stored.delete(key);
          },
        },
  };

  return win as unknown as FakeWindow;
}

/** Storage carried over to a second controller, as a page reload would. */
function replay(win: FakeWindow, extra: Parameters<typeof fakeWindow>[0] = {}) {
  return fakeWindow({ ...extra, storage: Object.fromEntries(win.stored) });
}

/** The event Chrome fires before it lets the page ask to be installed. */
function promptEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const calls: string[] = [];
  const event = {
    preventDefault: () => {
      calls.push("preventDefault");
    },
    prompt: async () => {
      calls.push("prompt");
      return { outcome, platform: "web", userChoice: Promise.resolve({ outcome }) };
    },
  } as unknown as BeforeInstallPromptEvent;
  return { event, calls };
}

function controllerFor(win: FakeWindow, at = NOW) {
  return new InstallPromptController(win, () => at);
}

describe("InstallPromptController before the browser asks", () => {
  it("shows nothing until beforeinstallprompt fires", () => {
    const win = fakeWindow();
    const controller = controllerFor(win);
    expect(controller.getState()).toEqual({ canInstall: false, isStandalone: false, showIosHint: false });

    controller.attach();
    const { event, calls } = promptEvent();
    win.emit("beforeinstallprompt", event);

    expect(controller.getState().canInstall).toBe(true);
    // The card is deferred, not suppressed: the browser's own install UI has to be
    // cancelled for it to hand control to us at all.
    expect(calls).toEqual(["preventDefault"]);
  });

  it("listens for the prompt, the install and both ways of asking for the iOS hint", () => {
    const win = fakeWindow();
    const controller = controllerFor(win);
    controller.attach();
    expect(win.listenerTypes()).toEqual(
      expect.arrayContaining([
        "beforeinstallprompt",
        "appinstalled",
        "before-app-install",
        "sutaeru:ios-hint-request",
      ])
    );
  });

  it("stops listening after detach, so a second subscription cannot double-open the card", () => {
    const win = fakeWindow();
    const controller = controllerFor(win);
    controller.attach()();

    win.emit("beforeinstallprompt", promptEvent().event);
    expect(controller.getState().canInstall).toBe(false);
  });

  it("ignores a server-side window", () => {
    const controller = new InstallPromptController(null, () => NOW);
    const detach = controller.attach();
    expect(typeof detach).toBe("function");
    detach();
    expect(controller.getState().canInstall).toBe(false);
    // With no browser to read there is nothing to offer, so the card stays hidden.
    expect(controller.getState().isStandalone).toBe(true);
  });
});

describe("InstallPromptController install and close", () => {
  it("runs the native prompt and keeps the card down for 14 days", async () => {
    const win = fakeWindow();
    const controller = controllerFor(win);
    controller.attach();
    const { event, calls } = promptEvent();
    win.emit("beforeinstallprompt", event);

    await expect(controller.install()).resolves.toBe(true);

    expect(calls).toContain("prompt");
    expect(controller.getState().canInstall).toBe(false);
    expect(JSON.parse(win.stored.get(DISMISSAL_KEY) as string)).toEqual({ timestamp: NOW });

    // A reload inside the window stays silent even with a live event.
    const reloaded = controllerFor(replay(win), NOW + 13 * DAY);
    reloaded.attach();
    expect(reloaded.getState().canInstall).toBe(false);
  });

  it("re-offers the card once the 14 days are up", () => {
    const win = fakeWindow({ storage: { [DISMISSAL_KEY]: JSON.stringify({ timestamp: NOW }) } });
    // Fourteen days and one second, written out: if the window ever changes, this
    // test fails instead of quietly following the new constant.
    const controller = controllerFor(win, NOW + 14 * DAY + 1000);
    controller.attach();

    win.emit("beforeinstallprompt", promptEvent().event);
    expect(controller.getState().canInstall).toBe(true);
  });

  it("treats closing the browser's dialog as a dismissal too", async () => {
    const win = fakeWindow();
    const controller = controllerFor(win);
    controller.attach();
    const { event, calls } = promptEvent("dismissed");
    win.emit("beforeinstallprompt", event);

    await expect(controller.install()).resolves.toBe(false);

    expect(calls).toContain("prompt");
    expect(controller.getState().canInstall).toBe(false);
    expect(win.stored.get(DISMISSAL_KEY)).toBeTruthy();
  });

  it("hides the card when the app really gets installed", () => {
    const win = fakeWindow();
    const controller = controllerFor(win);
    controller.attach();
    win.emit("beforeinstallprompt", promptEvent().event);
    expect(controller.getState().canInstall).toBe(true);

    win.emit("appinstalled", {});
    expect(controller.getState().canInstall).toBe(false);
    expect(controller.getState().isStandalone).toBe(true);
  });

  it("records the dismissal when the user taps Close", () => {
    const win = fakeWindow();
    const controller = controllerFor(win);
    controller.attach();
    win.emit("beforeinstallprompt", promptEvent().event);

    controller.dismiss();

    expect(controller.getState().canInstall).toBe(false);
    expect(JSON.parse(win.stored.get(DISMISSAL_KEY) as string)).toEqual({ timestamp: NOW });
  });

  it("does nothing when install is called with no event pending", async () => {
    const win = fakeWindow();
    const controller = controllerFor(win);
    controller.attach();
    await expect(controller.install()).resolves.toBe(false);
    expect(win.stored.size).toBe(0);
  });

  it("survives a browser that rejects prompt()", async () => {
    const win = fakeWindow();
    const controller = controllerFor(win);
    controller.attach();
    const event = {
      preventDefault: () => undefined,
      prompt: async () => {
        throw new Error("user canceled");
      },
    } as unknown as BeforeInstallPromptEvent;
    win.emit("beforeinstallprompt", event);

    await expect(controller.install()).resolves.toBe(false);
    expect(controller.getState().canInstall).toBe(false);
    // A browser failure is not a decision by the user, so nothing is recorded and
    // the card is offered again on the next visit.
    expect(win.stored.get(DISMISSAL_KEY)).toBeUndefined();
  });
});

describe("InstallPromptController iOS hint", () => {
  it("offers the hint to iOS Safari, which never fires beforeinstallprompt", () => {
    const win = fakeWindow(IPHONE_SAFARI);
    const controller = controllerFor(win);
    controller.attach();

    win.emit("before-app-install");
    expect(controller.getState().showIosHint).toBe(true);
    expect(controller.getState().canInstall).toBe(false);
    expect(win.stored.get(IOS_HINT_KEY)).toBeTruthy();
  });

  it("shows the hint once per device", () => {
    const win = fakeWindow(IPHONE_SAFARI);
    const controller = controllerFor(win);
    controller.attach();

    win.emit("before-app-install");
    controller.dismissIosHint();
    expect(controller.getState().showIosHint).toBe(false);

    win.emit("sutaeru:ios-hint-request");
    expect(controller.getState().showIosHint).toBe(false);

    // And the next page load stays silent as well.
    const reloadedWin = replay(win, IPHONE_SAFARI);
    const reloaded = controllerFor(reloadedWin);
    reloaded.attach();
    reloadedWin.emit("before-app-install");
    expect(reloaded.getState().showIosHint).toBe(false);
  });

  it("recognises an iPad reporting itself as a Mac", () => {
    const win = fakeWindow({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      maxTouchPoints: 5,
    });
    const controller = controllerFor(win);
    controller.attach();
    win.emit("sutaeru:ios-hint-request");
    expect(controller.getState().showIosHint).toBe(true);
  });

  it("keeps the hint away from Chrome-on-iOS and desktop browsers", () => {
    const windows = [
      fakeWindow({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.193 Mobile/15E148 Safari/604.1",
        maxTouchPoints: 5,
      }),
      fakeWindow({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      }),
      fakeWindow({
        userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
        maxTouchPoints: 10,
      }),
    ];
    for (const win of windows) {
      const controller = controllerFor(win);
      controller.attach();
      win.emit("before-app-install");
      expect(controller.getState().showIosHint).toBe(false);
    }
  });

  it("prefers the real install card over the hint on iOS", () => {
    const win = fakeWindow(IPHONE_SAFARI);
    const controller = controllerFor(win);
    controller.attach();
    win.emit("beforeinstallprompt", promptEvent().event);
    win.emit("before-app-install");

    expect(controller.getState()).toEqual({ canInstall: true, isStandalone: false, showIosHint: false });
  });
});

describe("InstallPromptController state changes", () => {
  it("notifies subscribers only when something visible changes", () => {
    const win = fakeWindow();
    const controller = controllerFor(win);
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    // Attaching registers listeners but changes nothing the user can see.
    controller.attach();
    expect(listener).not.toHaveBeenCalled();

    const { event } = promptEvent();
    win.emit("beforeinstallprompt", event);
    expect(listener).toHaveBeenCalledTimes(1);

    // The browser may fire the same prompt again; a second notification would make
    // React re-render the card for no reason.
    win.emit("beforeinstallprompt", event);
    expect(listener).toHaveBeenCalledTimes(1);

    controller.dismiss();
    expect(listener).toHaveBeenCalledTimes(2);
    controller.dismiss();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    win.emit("beforeinstallprompt", promptEvent().event);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("hands useSyncExternalStore a snapshot with a stable identity", () => {
    const win = fakeWindow();
    const controller = controllerFor(win);
    controller.attach();
    const first = controller.getState();
    expect(controller.getState()).toBe(first);

    win.emit("beforeinstallprompt", promptEvent().event);
    expect(controller.getState()).not.toBe(first);
  });

  it("honours standalone from either source", () => {
    const viaMedia = fakeWindow({ mediaStandalone: true });
    const viaAtom = fakeWindow({ standalone: true });

    for (const win of [viaMedia, viaAtom]) {
      const controller = controllerFor(win);
      controller.attach();
      win.emit("beforeinstallprompt", promptEvent().event);
      expect(controller.getState()).toEqual({ canInstall: false, isStandalone: true, showIosHint: false });
    }
  });

  it("still works when localStorage is blocked, as it is in private-mode Safari", async () => {
    const win = fakeWindow({ ...IPHONE_SAFARI, storageThrows: true });
    const controller = controllerFor(win);
    controller.attach();

    win.emit("before-app-install");
    expect(controller.getState().showIosHint).toBe(true);
    controller.dismissIosHint();

    win.emit("beforeinstallprompt", promptEvent().event);
    await expect(controller.install()).resolves.toBe(true);
    expect(controller.getState().canInstall).toBe(false);
  });
});
