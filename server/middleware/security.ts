/**
 * Security Middleware (Task 1+2)
 *
 * - Content Security Policy (CSP) headers to prevent XSS attacks
 * - Error monitoring middleware for structured server-side error logging
 */
import type { Request, Response, NextFunction } from "express";

// ─── CSP Headers ─────────────────────────────────────────────────────────────

/**
 * Apply Content Security Policy and other security headers.
 * Allows the Sutaeru app to function while blocking common XSS/injection vectors.
 */
export function cspMiddleware(req: Request, res: Response, next: NextFunction): void {
  const isProduction = process.env.NODE_ENV === "production";

  // Build CSP directives
  const cspDirectives = [
    "default-src 'self'",
    // Scripts: allow self + inline (needed for Vite HMR in dev) + eval (needed by some chart libs)
    isProduction
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    // Styles: allow self + inline (Tailwind injects inline styles)
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // Fonts
    "font-src 'self' https://fonts.gstatic.com data:",
    // Images: allow self + data URIs + S3/CDN
    "img-src 'self' data: blob: https:",
    // Connect: allow self + WebSocket (Vite HMR) + any HTTPS API
    isProduction
      ? "connect-src 'self' https:"
      : "connect-src 'self' ws: wss: https:",
    // Media
    "media-src 'self' blob: https:",
    // Object/embed: block entirely
    "object-src 'none'",
    // Frames: block by default
    "frame-src 'none'",
    // Base URI: restrict to self
    "base-uri 'self'",
    // Form action: restrict to self
    "form-action 'self'",
    // Upgrade insecure requests in production
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  res.setHeader("Content-Security-Policy", cspDirectives);

  // Additional security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );

  if (isProduction) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  next();
}

// ─── Error Monitoring ─────────────────────────────────────────────────────────

interface ErrorLog {
  timestamp: string;
  level: "error" | "warn";
  message: string;
  stack?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  userId?: number;
  requestId?: string;
}

// In-memory circular buffer for recent errors (last 200 entries)
const ERROR_BUFFER_SIZE = 200;
const errorBuffer: ErrorLog[] = [];

function addToErrorBuffer(entry: ErrorLog): void {
  errorBuffer.push(entry);
  if (errorBuffer.length > ERROR_BUFFER_SIZE) {
    errorBuffer.shift();
  }
}

export function getRecentErrors(): ErrorLog[] {
  return [...errorBuffer].reverse(); // Most recent first
}

/**
 * Express error-handling middleware.
 * Must be registered AFTER all routes with 4 arguments.
 */
export function errorMonitoringMiddleware(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const statusCode = err.status ?? err.statusCode ?? 500;
  const isServerError = statusCode >= 500;

  const logEntry: ErrorLog = {
    timestamp: new Date().toISOString(),
    level: isServerError ? "error" : "warn",
    message: err.message ?? "Unknown error",
    stack: isServerError ? err.stack : undefined,
    path: req.path,
    method: req.method,
    statusCode,
  };

  addToErrorBuffer(logEntry);

  if (isServerError) {
    console.error(`[ERROR] ${logEntry.timestamp} ${req.method} ${req.path} — ${err.message}`, err.stack);
  } else {
    console.warn(`[WARN] ${logEntry.timestamp} ${req.method} ${req.path} — ${err.message}`);
  }

  // Don't expose stack traces in production
  if (!res.headersSent) {
    res.status(statusCode).json({
      error: isServerError && process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
    });
  }
}

/**
 * Unhandled promise rejection + uncaught exception handlers.
 * Call once at server startup.
 */
export function registerGlobalErrorHandlers(): void {
  process.on("unhandledRejection", (reason: any) => {
    const entry: ErrorLog = {
      timestamp: new Date().toISOString(),
      level: "error",
      message: `Unhandled Promise Rejection: ${reason?.message ?? String(reason)}`,
      stack: reason?.stack,
    };
    addToErrorBuffer(entry);
    console.error("[FATAL] Unhandled Promise Rejection:", reason);
  });

  process.on("uncaughtException", (err: Error) => {
    const entry: ErrorLog = {
      timestamp: new Date().toISOString(),
      level: "error",
      message: `Uncaught Exception: ${err.message}`,
      stack: err.stack,
    };
    addToErrorBuffer(entry);
    console.error("[FATAL] Uncaught Exception:", err);
    // Allow Railway/process manager to restart
    process.exit(1);
  });
}
