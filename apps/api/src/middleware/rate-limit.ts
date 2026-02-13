import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error.js";

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

const buckets = new Map<string, Bucket>();

function getClientKey(req: Request): string {
  return (req.ip || req.header("x-forwarded-for") || "unknown").toString();
}

export function createRateLimiter(options: RateLimitOptions) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${options.keyPrefix}:${getClientKey(req)}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + options.windowMs
      });
      return next();
    }

    if (bucket.count >= options.maxRequests) {
      return next(new AppError("Too many requests", 429));
    }

    bucket.count += 1;
    return next();
  };
}

export function clearRateLimitBuckets() {
  buckets.clear();
}
