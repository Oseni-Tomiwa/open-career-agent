import type { FastifyReply, FastifyRequest } from 'fastify';

export interface RateLimiterOptions {
  readonly maxRequests: number;
  readonly windowMs: number;
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private readonly records = new Map<string, RateLimitRecord>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  public constructor(options: RateLimiterOptions) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;
  }

  public check(
    key: string,
    now = Date.now(),
  ): {
    readonly allowed: boolean;
    readonly remaining: number;
    readonly retryAfterSeconds: number;
  } {
    this.cleanup(now);
    const existing = this.records.get(key);

    if (!existing || now >= existing.resetTime) {
      this.records.set(key, { count: 1, resetTime: now + this.windowMs });
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        retryAfterSeconds: 0,
      };
    }

    if (existing.count >= this.maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((existing.resetTime - now) / 1000),
      );
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: this.maxRequests - existing.count,
      retryAfterSeconds: 0,
    };
  }

  public reset(): void {
    this.records.clear();
  }

  private cleanup(now: number): void {
    if (this.records.size < 1000) return;
    for (const [key, record] of this.records.entries()) {
      if (now >= record.resetTime) {
        this.records.delete(key);
      }
    }
  }
}

export function createAuthRateLimiter(
  options: RateLimiterOptions = { maxRequests: 5, windowMs: 60_000 },
) {
  const limiter = new RateLimiter(options);

  return async function rateLimitHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const ip = request.ip || request.raw.socket.remoteAddress || '127.0.0.1';
    const route = request.routeOptions.url || request.raw.url || '';
    const key = `${ip}:${route}`;

    const result = limiter.check(key);

    if (!result.allowed) {
      reply.header('Retry-After', result.retryAfterSeconds.toString());
      await reply.status(429).send({
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many authentication attempts. Please try again later.',
          requestId: request.id,
        },
      });
    }
  };
}
