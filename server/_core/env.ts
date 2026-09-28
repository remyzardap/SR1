/**
 * Environment variables configuration
 *
 * Values are loaded from (in priority order):
 * 1. Google Secret Manager (loaded at startup in index.ts)
 * 2. Local .env file (for development)
 * 3. Default values (for optional settings)
 *
 * To skip Secret Manager and use local .env only, set SKIP_SECRET_MANAGER=true
 *
 * Every field is a getter so it reads process.env when accessed. index.ts loads
 * Secret Manager values with a top-level await, but static imports (this file)
 * are evaluated first — a plain object would freeze empty values at import time.
 */
export const ENV = {
  get appId() { return process.env.VITE_APP_ID ?? ""; },
  get cookieSecret() { return process.env.SESSION_SECRET ?? process.env.JWT_SECRET ?? ""; },
  get databaseUrl() { return process.env.DATABASE_URL ?? ""; },
  get ownerOpenId() { return process.env.OWNER_OPEN_ID ?? ""; },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  get forgeApiUrl() { return process.env.BUILT_IN_FORGE_API_URL ?? ""; },
  get forgeApiKey() { return process.env.BUILT_IN_FORGE_API_KEY ?? ""; },
  // Platform-level model keys (Qwen + Gemini). Customers never supply their own.
  get qwenApiKey() { return process.env.QWEN_API_KEY ?? ""; },
  get geminiApiKey() { return process.env.GEMINI_API_KEY ?? process.env.GEMINI ?? ""; },
  get sonarApiKey() { return process.env.SONAR_API_KEY ?? process.env.SONAR_PERPLEXITY ?? ""; },
  // ElevenLabs (Kemma Voice)
  get elevenLabsApiKey() { return process.env.ELEVEN_LABS_API_KEY ?? ""; },
  get elevenLabsAgentId() { return process.env.ELEVEN_LABS_AGENT_ID ?? ""; },
  get elevenLabsVoiceId() { return process.env.ELEVEN_LABS_VOICE_ID ?? ""; },
  // Email (for password reset)
  get emailHost() { return process.env.EMAIL_HOST ?? "smtp.mailgun.org"; },
  get emailPort() { return parseInt(process.env.EMAIL_PORT ?? "587"); },
  get emailUser() { return process.env.EMAIL_USER ?? ""; },
  get emailPassword() { return process.env.EMAIL_PASSWORD ?? ""; },
  get emailFrom() { return process.env.EMAIL_FROM ?? "no-reply@sutaeru.com"; },
  get appUrl() {
    return process.env.APP_URL ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "https://sutaeru.com");
  },
};
