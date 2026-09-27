import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from '../routers';
import { createContext } from './context';
import { registerChatStreamRoute } from '../routers/chat';
import { registerAtelierRoutes } from '../routers/atelier';
import intelligenceRouter, { setupIntelligenceWebSocket } from '../routers/intelligence';
import { registerGoogleCallbackRoute } from '../routers/googleCallback';
import { registerTelegramWebhookRoute } from '../routers/telegramWebhook';
import { kemmaStreamRoute } from '../routes/kemmaStream';
import { startTrialExpiryJob } from '../core/trialManager';
import { setupVite, serveStatic } from './vite';
import { loadSecretsFromSecretManager } from './secretManager';
import { ENV } from './env';
import { sdk } from './sdk';
import { generalApiRateLimiter } from './rateLimiter';
import { registerFileRoutes } from '../routes/files';

// Load secrets from Secret Manager before starting
await loadSecretsFromSecretManager();

// Sessions are signed with this key; an empty one makes every login fail at runtime.
if (ENV.isProduction && !ENV.cookieSecret) {
  console.error("[Startup] SESSION_SECRET (or JWT_SECRET) is not set - refusing to start.");
  process.exit(1);
}

const app = express();

// Session gate for non-tRPC Express routes (atelier, intelligence, kemma stream).
// Webhooks and OAuth callbacks are registered before this middleware so they stay public.
async function requireSession(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    (req as any).user = await sdk.authenticateRequest(req);
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
app.use(express.json({ limit: '10mb' }));

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

// Protected Express routes
registerChatStreamRoute(app as any); // already has its own auth
app.use('/api/atelier', requireSession);
registerAtelierRoutes(app);
app.use('/api/intelligence', requireSession, intelligenceRouter);
app.post('/api/kemma/stream', requireSession, kemmaStreamRoute);
registerFileRoutes(app);

// tRPC API routes
app.use('/api/trpc', createExpressMiddleware({
  router: appRouter,
  createContext,
}));

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

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Sutaeru server running on port ${PORT}`);
  });
})();
