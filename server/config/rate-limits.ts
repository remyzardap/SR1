export const rateLimitConfig = {
  unauthenticated: { 
    requests: 50, 
    windowMs: 60000 
  },
  authenticated: { 
    requests: 200, 
    windowMs: 60000 
  },
  // Image generation, per signed-in user: see server/routes/fn/image.ts.
  imageGenerateHourly: { 
    requests: 20, 
    windowMs: 60 * 60 * 1000 
  },
  imageGenerateDaily: { 
    requests: 100, 
    windowMs: 24 * 60 * 60 * 1000 
  },
  // Video generation, per signed-in user: see server/routes/fn/video.ts.
  videoGenerateHourly: { 
    requests: 10, 
    windowMs: 60 * 60 * 1000 
  },
  videoGenerateDaily: { 
    requests: 30, 
    windowMs: 24 * 60 * 60 * 1000 
  },
};
