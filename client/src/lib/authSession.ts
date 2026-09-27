const AUTH_TOKEN_KEY = "sutaeru-auth-token";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: unknown): boolean {
  if (typeof window === "undefined" || typeof token !== "string" || !token.trim()) {
    return false;
  }

  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  return true;
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}