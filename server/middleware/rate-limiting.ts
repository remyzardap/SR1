import { Request, Response, NextFunction } from 'express';
import { rateLimitConfig } from '../config/rate-limits';

interface RateLimitData {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitData>();

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const key = (req as any).user?.id || req.ip || 'unknown';
  const isAuthenticated = !!(req as any).user?.id;
  const config = isAuthenticated ? rateLimitConfig.authenticated : rateLimitConfig.unauthenticated;
  
  const now = Date.now();
  
  let data = store.get(key);
  
  if (!data || data.resetTime < now) {
    data = { count: 1, resetTime: now + config.windowMs };
    store.set(key, data);
  } else {
    data.count++;
  }
  
  const remaining = Math.max(0, config.requests - data.count);
  
  res.setHeader('X-RateLimit-Limit', config.requests.toString());
  res.setHeader('X-RateLimit-Remaining', remaining.toString());
  res.setHeader('X-RateLimit-Reset', new Date(data.resetTime).toISOString());
  
  if (data.count > config.requests) {
    res.setHeader('Retry-After', Math.ceil((data.resetTime - now) / 1000).toString());
    return res.status(429).json({ 
      error: 'Too Many Requests',
      retryAfter: Math.ceil((data.resetTime - now) / 1000)
    });
  }
  
  next();
}

setInterval(() => {
  const now = Date.now();
  Array.from(store.entries()).forEach(([key, data]) => {
    if (data.resetTime < now) {
      store.delete(key);
    }
  });
}, 300000);
