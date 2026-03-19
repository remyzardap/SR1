import type { Express } from "express";
import { exchangeCodeForTokens, validateOAuthState } from "../services/google";

export function registerGoogleCallbackRoute(app: Express) {
  app.get("/api/google/callback", async (req, res) => {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    const error = req.query.error as string | undefined;

    if (error) {
      res.redirect("/connections?google=error&reason=" + encodeURIComponent(error));
      return;
    }

    if (!code || !state) {
      res.redirect("/connections?google=error&reason=missing_params");
      return;
    }

    const userId = validateOAuthState(state);
    if (!userId) {
      res.redirect("/connections?google=error&reason=invalid_state");
      return;
    }

    try {
      const result = await exchangeCodeForTokens(code, userId);
      res.redirect("/connections?google=success&email=" + encodeURIComponent(result.email || ""));
    } catch (err) {
      console.error("[Google OAuth] Token exchange failed:", err);
      res.redirect("/connections?google=error&reason=token_exchange_failed");
    }
  });
}
