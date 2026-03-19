/**
 * Rate limiting middleware for auth routes.
 *
 * Protects against brute-force attacks on login, registration,
 * and password-reset endpoints. Uses an in-process memory store
 * (suitable for single-instance deployments on Railway).
 *
 * For multi-instance deployments, swap the default MemoryStore
 * for a Redis-backed store such as `rate-limit-redis`.
 */

import rateLimit from "express-rate-limit";

// ─── Login / 2FA: 10 attempts per 15 minutes per IP ──────────────────────────
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many login attempts. Please wait 15 minutes before trying again.",
  },
  skipSuccessfulRequests: true, // Only count failed attempts toward the limit
});

// ─── Registration: 5 accounts per hour per IP ────────────────────────────────
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many registration attempts from this IP. Please try again later.",
  },
});

// ─── Password reset: 5 requests per hour per IP ──────────────────────────────
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many password reset requests. Please try again in an hour.",
  },
});

// ─── General API: 200 requests per minute per IP (broad protection) ──────────
export const generalApiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please slow down.",
  },
  skip: (req) => {
    // Skip health checks from rate limiting
    return req.path === "/api/health";
  },
});
