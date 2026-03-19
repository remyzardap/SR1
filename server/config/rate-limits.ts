export const rateLimitConfig = {
  unauthenticated: { 
    requests: 50, 
    windowMs: 60000 
  },
  authenticated: { 
    requests: 200, 
    windowMs: 60000 
  },
};
