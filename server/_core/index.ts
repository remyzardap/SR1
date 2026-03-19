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

// Load secrets from Secret Manager before starting
await loadSecretsFromSecretManager();

const app = express();

app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? (process.env.APP_URL || "https://sutaeru.com")
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

// Streaming chat route (SSE, not tRPC)
registerChatStreamRoute(app as any);

// Google OAuth callback (Express route, not tRPC)
registerGoogleCallbackRoute(app);

// Telegram webhook (Express route, not tRPC)
registerTelegramWebhookRoute(app);

// Atelier — AI report builder routes
registerAtelierRoutes(app);

// Intelligence API routes (HER voice, blended agents)
app.use('/api/intelligence', intelligenceRouter);

// Kemma agent streaming route
app.post('/api/kemma/stream', kemmaStreamRoute);

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
