import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { PASSWORD_CHANGE_REQUIRED_MESSAGE } from '@shared/const';
import { appRouter } from '../routers';
import { createContext } from './context';
import { registerChatStreamRoute } from '../routers/chat';
import { registerAtelierRoutes } from '../routers/atelier';
import { registerDocumentBody, registerDocumentRoutes } from '../routers/documents';
import intelligenceRouter, { setupIntelligenceWebSocket } from '../routers/intelligence';
import { registerGoogleCallbackRoute } from '../routers/googleCallback';
import { registerTelegramWebhookRoute } from '../routers/telegramWebhook';
import { kemmaStreamRoute } from '../routes/kemmaStream';
import { startTrialExpiryJob } from '../core/trialManager';
import { startJobRunner } from '../core/jobs';
import { registerJobsTick } from '../core/jobsTick';
import { setupVite, serveStatic } from './vite';
import { loadSecretsFromSecretManager } from './secretManager';
import { ENV } from './env';
import { sdk } from './sdk';
import { errorMonitoringMiddleware, registerGlobalErrorHandlers } from '../middleware/security';
import { generalApiRateLimiter } from './rateLimiter';
import { registerFileRoutes } from '../routes/files';
import { fnRouter } from '../routes/fn';
import { startWhatsAppBaileys, waStatus } from '../services/whatsappBaileys';
import whatsappWebhookRouter from '../routes/webhooks/whatsapp';
import { adminMessagingRouter } from '../routes/adminMessaging';
import { codeSessionsRouter } from '../routes/codeSessions';
import { registerExportRoutes } from '../routes/export';
import { approvalsRouter } from '../routes/approvals';

// Load secrets from Secret Manager before starting
await loadSecretsFromSecretManager();

// Sessions are signed with this key; an empty one makes every login fail at runtime.
if (ENV.isProduction && !ENV.cookieSecret) {
  console.error("[Startup] SESSION_SECRET (or JWT_SECRET) is not set - refusing to start.");
  process.exit(1);
}

const app = express();

// Behind Caddy exactly one proxy hop sits in front of this server. Trusting it makes
// req.ip the real client address (the last XFF entry the proxy appended) instead of
// the proxy's own address, and untrusted leading entries spoofed by clients are ignored.
app.set("trust proxy", 1);

// Session gate for non-tRPC Express routes (atelier, intelligence, kemma stream).
// Webhooks and OAuth callbacks are registered before this middleware so they stay public.
async function requireSession(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const user = await sdk.authenticateRequest(req);
    // tRPC middleware cannot cover these routes, so the change-your-password lock is repeated here:
    // an account whose password was issued by an admin may sign in, but may not generate documents.
    if (user.mustChangePassword) {
      res.status(403).json({ error: PASSWORD_CHANGE_REQUIRED_MESSAGE });
      return;
    }
    (req as any).user = user;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

app.use(generalApiRateLimiter);

// Public health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Allowed web origins: comma-separated ALLOWED_ORIGINS wins, then APP_URL,
// then the production default. Lets multiple frontends (e.g. sutaeru.com and
// a preview deployment) sign in against the same server.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.APP_URL || "https://sutaeru.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin))
    : true,
  credentials: true,
}));
app.use(cookieParser());
// Attachments travel as base64 inside the JSON body (up to 20 MB of files, about 27 MB encoded), so the two
// routes that take them accept bigger bodies than the rest. requireSession runs first, so an anonymous caller
// can never make the server read a large body. The global parser below skips a body that is already parsed.
const attachmentBody = express.json({ limit: '32mb', verify: (req, _res, buf) => { (req as any).rawBody = buf; } });
app.use('/api/fn', requireSession, attachmentBody);
app.use('/api/kemma/stream', requireSession, attachmentBody);
app.post('/api/admin/code-sessions', requireSession, attachmentBody);
registerDocumentBody(app, requireSession, attachmentBody); // /api/documents/generate: sources travel in the body, 413 JSON on overflow
app.post('/api/admin/code-sessions/:id/message', requireSession, attachmentBody);
app.use(['/api/fn', '/api/kemma/stream', '/api/admin/code-sessions'], (err: any, _req: any, res: any, next: any) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large. Keep attachments under 20 MB in total.' });
  next(err);
});

app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf;
  },
}));

app.use((req, res, next) => {
  if (req.headers.accept?.includes('text/html')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Public / webhook routes (must stay reachable without a session)
registerGoogleCallbackRoute(app);
registerTelegramWebhookRoute(app);
app.use('/webhooks/whatsapp', whatsappWebhookRouter); // Meta verifies with a GET, posts signed events

// Protected Express routes
registerChatStreamRoute(app as any); // already has its own auth
app.use('/api/atelier', requireSession);
registerAtelierRoutes(app);
app.use('/api/documents', requireSession);
registerDocumentRoutes(app);
app.use('/api/intelligence', requireSession, intelligenceRouter);
app.use('/api/admin/code-sessions', requireSession, codeSessionsRouter); // headless Claude Code on the VPS, owner only
app.use('/api/admin/messaging', requireSession, adminMessagingRouter); // status and pairing for the in-app WhatsApp screen
app.get('/api/admin/whatsapp', requireSession, (req, res) => {
  if ((req as any).user?.role !== 'admin') return res.status(403).send('Admin only');
  const body = waStatus.state === 'open'
    ? `<h1>Connected</h1><p>Linked as +${waStatus.number}. Send yourself a message to talk to Sutaeru.</p>`
    : waStatus.pairingCode
      ? `<h1 style="font:700 48px monospace;letter-spacing:6px">${waStatus.pairingCode}</h1><p>WhatsApp &gt; Settings &gt; Linked devices &gt; Link a device &gt; Link with phone number instead. Enter this code now.</p>`
      : `<h1>${waStatus.state === 'off' ? 'Bridge is off' : 'Getting a code…'}</h1><p>${waStatus.note ?? 'This page refreshes by itself.'}</p>`;
  res.setHeader('Cache-Control', 'no-store');
  res.send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="4"><title>WhatsApp link</title><body style="font-family:system-ui;padding:32px;max-width:520px;margin:auto">${body}</body>`);
});
app.post('/api/kemma/stream', requireSession, kemmaStreamRoute);
app.use('/api/kemma/approvals', requireSession, approvalsRouter);
app.use('/api/fn', requireSession, fnRouter);
registerJobsTick(app);
registerFileRoutes(app);
registerExportRoutes(app);

// tRPC API routes
app.use('/api/trpc', createExpressMiddleware({
  router: appRouter,
  createContext,
}));

// Structured error logging for anything that reaches next(err). cspMiddleware is
// deliberately NOT registered: its production policy (frame-src 'none', connect-src
// 'self' https:) would break the YouTube embeds in FloatingVideoPlayer.tsx and the
// wss connection to /ws/intelligence used by useSutaeruIntelligence. Fix the policy
// for those two first, then mount it.
app.use(errorMonitoringMiddleware);

registerGlobalErrorHandlers();

const PORT = parseInt(process.env.PORT || '5000', 10);
const server = createServer(app);

(async () => {
  if (process.env.NODE_ENV === 'development') {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  setupIntelligenceWebSocket(server);

  // Start trial expiry background job
  startTrialExpiryJob();
  startJobRunner();
  startWhatsAppBaileys();

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Sutaeru server running on port ${PORT}`);
  });
})();
