// Design-preview mode: lets reviewers browse the UI screens without a real
// session. Gated behind ?preview=1 / a login-page link; never grants real
// access — all data calls still hit the server unauthenticated and simply
// show empty/error states. Backend workflows stay real, not simulated.

const PREVIEW_KEY = "sutaeru-design-preview";

export type PreviewUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export const previewUser: PreviewUser = {
  id: "design-preview",
  name: "Guest",
  email: "guest@sutaeru.design",
  role: "user",
};

export function isDesignPreview(): boolean {
  if (typeof window === "undefined") return false;

  const flag = new URLSearchParams(window.location.search).get("preview");
  if (flag === "1") {
    window.sessionStorage.setItem(PREVIEW_KEY, "1");
    return true;
  }
  if (flag === "0") {
    window.sessionStorage.removeItem(PREVIEW_KEY);
    return false;
  }
  // Real sign-in is the default. Preview only runs after ?preview=1 or the login page's explore link.
  return window.sessionStorage.getItem(PREVIEW_KEY) === "1";
}

export function enterDesignPreview(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PREVIEW_KEY, "1");
}

export function exitDesignPreview(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PREVIEW_KEY);
}
