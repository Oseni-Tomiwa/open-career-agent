import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limit.js';

describe('RateLimiter', () => {
  it('allows requests within limit and tracks remaining quota', () => {
    const limiter = new RateLimiter({ maxRequests: 3, windowMs: 60_000 });
    const now = 1_000_000;

    const res1 = limiter.check('ip-1', now);
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(2);

    const res2 = limiter.check('ip-1', now + 100);
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(1);

    const res3 = limiter.check('ip-1', now + 200);
    expect(res3.allowed).toBe(true);
    expect(res3.remaining).toBe(0);

    const res4 = limiter.check('ip-1', now + 300);
    expect(res4.allowed).toBe(false);
    expect(res4.remaining).toBe(0);
    expect(res4.retryAfterSeconds).toBe(60);
  });

  it('resets quota after window expiration', () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 10_000 });
    const now = 1_000_000;

    expect(limiter.check('ip-1', now).allowed).toBe(true);
    expect(limiter.check('ip-1', now + 100).allowed).toBe(true);
    expect(limiter.check('ip-1', now + 200).allowed).toBe(false);

    // After window expires (10s)
    const future = now + 10_001;
    const res = limiter.check('ip-1', future);
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(1);
  });

  it('isolates rate limits by key', () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 10_000 });
    const now = 1_000_000;

    expect(limiter.check('user-1', now).allowed).toBe(true);
    expect(limiter.check('user-1', now).allowed).toBe(false);

    expect(limiter.check('user-2', now).allowed).toBe(true);
  });
});
