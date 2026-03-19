import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimitMiddleware } from './rate-limiting';
import { Request, Response, NextFunction } from 'express';

describe('rateLimitMiddleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let headers: Record<string, string>;
  let statusCode: number;
  let jsonBody: any;

  beforeEach(() => {
    headers = {};
    statusCode = 200;
    jsonBody = null;
    req = { ip: '127.0.0.1' };
    res = {
      setHeader: (key: string, value: string) => { headers[key] = value; },
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => { jsonBody = body; }
        };
      },
    } as any;
    next = () => {};
  });

  it('should set correct headers for unauthenticated user', () => {
    rateLimitMiddleware(req as Request, res as Response, next);
    expect(headers['X-RateLimit-Limit']).toBe('50');
    expect(headers['X-RateLimit-Remaining']).toBe('49');
    expect(headers['X-RateLimit-Reset']).toBeDefined();
  });

  it('should allow requests under limit', () => {
    let called = false;
    rateLimitMiddleware(req as Request, res as Response, () => { called = true; });
    expect(called).toBe(true);
    expect(statusCode).toBe(200);
  });

  it('should block requests over limit with 429', () => {
    for (let i = 0; i < 51; i++) {
      rateLimitMiddleware(req as Request, res as Response, next);
    }
    expect(statusCode).toBe(429);
    expect(jsonBody.error).toBe('Too Many Requests');
    expect(jsonBody.retryAfter).toBeGreaterThan(0);
  });

  it('should use userId for authenticated users', () => {
    (req as any).user = { id: 'user-123' };
    rateLimitMiddleware(req as Request, res as Response, next);
    expect(headers['X-RateLimit-Limit']).toBe('200');
  });
});
