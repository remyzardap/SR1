# Sutaeru — replit.md

## Overview

Sutaeru is a **personal AI identity and memory platform** ("soul-cloud"). Users create a persistent AI identity, collect skills from any AI model, store memories, and connect to external LLM providers. The platform also includes a business back-office suite (receipts, tasks, procurement, reports) and a file generation engine (FileForge).

**Core product pillars:**
- **Identity**: Persistent AI persona with handle, bio, traits, and language settings
- **Skills**: Reusable AI capabilities (prompts, behaviors, workflows) that can be public or private
- **Memories**: Structured long-term knowledge storage (5 types) injected into chat context
- **Connections**: Secure links to OAuth services and third-party API keys (the LLM is chosen by the platform, never by the customer)
- **Chat (S1)**: Streaming SSE chat with automatic intelligent agent routing across Qwen, Gemini and Sonar. Google Workspace integration (Gmail/Calendar/Drive) connected to S1 — when user asks about emails, calendar, or files, S1 detects the intent and injects live Google data into context
- **FileForge**: Prompt-to-document generation (PDF, DOCX, XLSX, PPTX, Markdown)
- **Image Generation**: Gemini image model via Vertex AI
- **HER Voice**: ElevenLabs conversational AI assistant with personality styles
- **Back Office**: Receipt OCR, task tracking, procurement workflows, Stripe billing
- **Board**: Block-based content system for organizing notes, media, tasks, and chat fragments

The app is deployed on **Replit** with a PostgreSQL database.

---

## User Preferences

Preferred communication style: Simple, everyday language.

---

## System Architecture

### Frontend

- **Framework**: React 18 with TypeScript, using Vite as the build tool
- **Routing**: `wouter` (lightweight, client-side)
- **State / Data fetching**: TanStack Query v5 + tRPC v11 (`@trpc/react-query`)
- **UI components**: shadcn/ui (New York style) built on Radix UI primitives
- **Styling**: Tailwind CSS v4 with CSS custom properties for theming; PostCSS via `@tailwindcss/postcss`
- **Design system**: "Space Gradient" — glassmorphism cards, ambient glow blobs, multiple gradient themes, Syne + DM Sans fonts
- **Forms**: react-hook-form + Zod validation via `@hookform/resolvers`
- **Serialization**: superjson for tRPC transport (handles Dates, BigInts, etc.)
- **Path aliases**: `@/` → `client/src/`, `@shared/` → `shared/`

The frontend is a single-page application. Protected routes redirect unauthenticated users to `/login`. The `DashboardLayout` component wraps all authenticated pages with a sidebar that supports swipe-to-close on mobile.

### Backend

- **Runtime**: Node.js (ESM) with Express
- **API layer**: tRPC v11 mounted at `/api/trpc` — all typed, all validated with Zod
- **Entry point**: `server/_core/index.ts` (dev: `tsx watch`, prod: compiled with esbuild)
- **Streaming**: Server-Sent Events (SSE) for chat, registered separately from tRPC via `registerChatStreamRoute`
- **Authentication**: JWT tokens stored in HTTP-only cookies (`app_session_id`, 1-year expiry). `server/_core/sdk.ts` handles token issuance and verification via `jose`
- **Middleware**: cookie-parser, cors, rate limiting (`express-rate-limit` — in-memory store), Stripe webhook handler with raw body access
- **File serving**: In dev, Vite middleware; in prod, `express.static` from `dist/public` with SPA fallback

#### S1 Intelligent Routing Layer
S1 is the single user-facing AI entity with one consistent personality. The underlying models are invisible — the user always sees "S1", never individual model names. Internally, `server/routers/s1Router.ts` classifies messages and routes to the best backend model:
- Gemini — **default**, general knowledge and reasoning
- Qwen — writing, documentation, quick tasks (translation, formatting)
- Sonar (Perplexity) — web/real-time search queries

Fallback order: `preferred → gemini → qwen → sonar`. The system prompt enforces a strong unified personality — S1 never acknowledges which model is running underneath.

#### Google Workspace Integration
`server/services/google.ts` provides OAuth2 flow + Gmail, Calendar, and Drive API wrappers. `server/routers/google.ts` exposes tRPC endpoints for connect/disconnect/list/send. `server/routers/googleCallback.ts` handles the OAuth callback via Express. When a user asks S1 about emails, calendar events, or files, the chat router detects the intent via `detectGoogleIntent()` and injects live Google data into the system prompt. Requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env vars. Token storage: `google_tokens` table.

#### Image Generation
`server/_core/imageGeneration.ts` uses a Gemini image model via Vertex AI. Supports custom sizes and quality options. Generated images are saved to the files table.

#### HER Voice
`server/services/elevenlabs.ts` integrates ElevenLabs Conversational AI for the HER voice assistant. Uses WebSocket-based real-time audio with personality styles (warm, professional, mysterious, playful). Voice: Carolyn Scarlett Jo (raspy, intimate).

### Data Storage

- **Primary DB**: PostgreSQL via `drizzle-orm/pg-core`, configured with `DATABASE_URL`
- **ORM**: Drizzle ORM with schema defined in `drizzle/schema.ts`
- **Migrations**: SQL files in `drizzle/migrations/`
- **File storage**: AWS S3 via `@aws-sdk/client-s3` for avatars, generated files, and uploads. Accessed through `server/storage.ts` storage helpers

**Key tables**: `users`, `identities`, `skills`, `memories`, `connections`, `chat_messages`, `files`, `api_keys`, `receipts`, `tasks`, `procurementRequests`, `messageLogs`, `payments`, `businesses`, `auditLogs`, `betaInviteCodes`, `passwordResetTokens`, `emailVerificationTokens`, `blocks`, `google_tokens`

### Sidebar Navigation Groups
- **sutaeru** (core): Chat, Identity, Skills, Memories, Connections, Discover, Feed, Health, HER, Board
- **forge** (file generation): Atelier, Generate, Image Gen, My Files
- **office** (back office): Businesses, Dashboard, Receipts, Review Queue, Tasks, Procurement, Reports, WhatsApp, Billing
- **settings**: Settings

### Authentication & Authorization

- **Email/password**: bcryptjs hashing, stored in `users.passwordHash`
- **Handle-based login**: Founders can log in with `@handle` (no email required)
- **TOTP 2FA**: speakeasy + qrcode, setup/verify/disable in Settings
- **Password reset**: Token-based, email delivery via Nodemailer (`server/_core/email.ts`)
- **Email verification**: Token-based flow
- **Roles**: `user` | `admin` — admin-only tRPC procedures use `adminProcedure` middleware
- **Session cookie options**: `httpOnly: true`, `sameSite: lax`, `secure` on HTTPS — see `server/_core/cookies.ts`

### LLM Provider Abstraction

All chat and document generation goes through `server/core/kemmaRouter.ts` (env-driven `KEMMA_MODEL_*` slots) and uses only two model families:
- Qwen (`QWEN_API_KEY`, `QWEN_BASE_URL`) — text, tools, reports
- Gemini (`GEMINI_API_KEY` or Vertex AI) — vision, planning, verification, embeddings, images

Perplexity Sonar is used for the Kemma `web_search` tool and for web/news queries in S1 chat. Customers cannot choose or supply models or keys; platform keys come from env vars.

---

## External Dependencies

### Infrastructure
- **Replit**: Hosting platform, PostgreSQL database, env var management
- **AWS S3**: File and avatar storage (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`)

### AI / LLM Providers
| Provider | Env Var | Use |
|---|---|---|
| Qwen | `QWEN_API_KEY`, `QWEN_BASE_URL` | Text, tools, reports, writing |
| Gemini | `GEMINI_API_KEY` (or `VERTEX_PROJECT` + `GOOGLE_APPLICATION_CREDENTIALS`) | Vision, planning, verification, images |
| Perplexity Sonar | `SONAR_API_KEY` / `SONAR_PERPLEXITY` | Web search (Kemma tool + S1 chat) |
| ElevenLabs | `ELEVEN_LABS_API_KEY`, `ELEVEN_LABS_AGENT_ID`, `ELEVEN_LABS_VOICE_ID` | HER Voice feature |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Gmail, Calendar, Drive integration |

### Auth
- **JWT**: `SESSION_SECRET` (cookie signing/verification via `jose`)

### Payments
- **Stripe**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, Stripe Price IDs — subscription billing with webhook handler at `/api/stripe/webhook`

### Email
- **Nodemailer (SMTP)**: `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM`, `APP_URL` — used for password reset and email verification

### Internal Platform
- `BUILT_IN_FORGE_API_URL` + `BUILT_IN_FORGE_API_KEY` — Forge storage proxy (notifications, voice transcription, maps, data API)
- `COOKIE_DOMAIN` — production cookie domain for subdomain sharing

### Key npm Packages
- `drizzle-orm` + `pg` — database ORM
- `@trpc/server` + `@trpc/client` + `@trpc/react-query` — type-safe API layer
- `@tanstack/react-query` — server state management
- `jose` — JWT sign/verify
- `bcryptjs` — password hashing
- `speakeasy` + `qrcode` — TOTP 2FA
- `stripe` — payment processing
- `nodemailer` — email delivery
- `pdfkit`, `docx`, `exceljs`, `pptxgenjs` — document generation (FileForge)
- `@aws-sdk/client-s3` — S3 file storage
- `express-rate-limit` — brute-force protection
- `nanoid` — unique ID generation
- `wouter` — client-side routing
- `ws` — WebSocket support (ElevenLabs HER)

---

## Dev Commands

- **Dev**: `npm run dev` → `NODE_ENV=development tsx watch server/_core/index.ts`
- **Build**: `npm run build` → `vite build && esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist`
- **Prod**: `node ./dist/index.js`
- **DB push**: `npm run db:push`

## Test Account
- Email: `testuser_1772728628@example.com`
- Password: `testpass123`
