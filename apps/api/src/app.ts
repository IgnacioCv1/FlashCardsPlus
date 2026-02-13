import express, { type Request, type Response } from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { createRateLimiter } from "./middleware/rate-limit.js";
import { requireAuth } from "./middleware/require-auth.js";
import { aiRouter } from "./routes/ai.js";
import { authRouter } from "./routes/auth.js";
import { cardsRouter } from "./routes/cards.js";
import { decksRouter } from "./routes/decks.js";
import { ingestRouter } from "./routes/ingest.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true
    })
  );
  app.use(express.json());

  const globalLimiter = createRateLimiter({
    windowMs: 60_000,
    maxRequests: 300,
    keyPrefix: "global"
  });
  const authLimiter = createRateLimiter({
    windowMs: 60_000,
    maxRequests: 30,
    keyPrefix: "auth"
  });
  const refreshLimiter = createRateLimiter({
    windowMs: 60_000,
    maxRequests: 20,
    keyPrefix: "auth-refresh"
  });

  app.use(globalLimiter);

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.use("/auth", authLimiter);
  app.use("/auth/refresh", refreshLimiter);
  app.use("/auth", authRouter);
  app.use("/ai", requireAuth, aiRouter);
  app.use("/decks", requireAuth, decksRouter);
  app.use("/cards", requireAuth, cardsRouter);
  app.use("/ingest", requireAuth, ingestRouter);

  app.use(errorHandler);
  return app;
}
