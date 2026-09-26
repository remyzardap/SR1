/**
 * Environment variables configuration
 * 
 * Values are loaded from (in priority order):
 * 1. Google Secret Manager (loaded at startup in index.ts)
 * 2. Local .env file (for development)
 * 3. Default values (for optional settings)
 * 
 * To skip Secret Manager and use local .env only, set SKIP_SECRET_MANAGER=true
 */
export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.SESSION_SECRET ?? process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Platform-level model keys (Qwen + Gemini). Customers never supply their own.
  qwenApiKey: process.env.QWEN_API_KEY ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? process.env.GEMINI ?? "",
  sonarApiKey: process.env.SONAR_API_KEY ?? process.env.SONAR_PERPLEXITY ?? "",
  // ElevenLabs (Kemma Voice)
  elevenLabsApiKey: process.env.ELEVEN_LABS_API_KEY ?? "",
  elevenLabsAgentId: process.env.ELEVEN_LABS_AGENT_ID ?? "",
  elevenLabsVoiceId: process.env.ELEVEN_LABS_VOICE_ID ?? "",
  // Email (for password reset)
  emailHost: process.env.EMAIL_HOST ?? "smtp.mailgun.org",
  emailPort: parseInt(process.env.EMAIL_PORT ?? "587"),
  emailUser: process.env.EMAIL_USER ?? "",
  emailPassword: process.env.EMAIL_PASSWORD ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "no-reply@sutaeru.com",
  appUrl: process.env.APP_URL ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "https://sutaeru.com"),
};
