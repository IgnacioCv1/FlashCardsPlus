import { Router } from "express";
import { z } from "zod";
import { issueTokenPair, revokeRefreshToken, rotateRefreshToken } from "../auth/token-service.js";
import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../lib/prisma.js";
import type { AuthenticatedLocals } from "../middleware/require-auth.js";
import { requireAuth } from "../middleware/require-auth.js";
import { asyncHandler } from "../utils/async-handler.js";

const devLoginSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(120).optional()
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1)
});

export const authRouter = Router();

authRouter.post(
  "/dev-login",
  asyncHandler(async (req, res) => {
    if (env.NODE_ENV === "production") {
      throw new AppError("Not found", 404);
    }

    const payload = devLoginSchema.parse(req.body);
    const user = await prisma.user.upsert({
      where: { email: payload.email },
      update: {
        ...(payload.name ? { name: payload.name } : {})
      },
      create: {
        email: payload.email,
        name: payload.name
      },
      select: {
        id: true,
        email: true
      }
    });

    const tokens = await issueTokenPair(user, {
      userAgent: req.header("user-agent") ?? undefined,
      ipAddress: req.ip
    });

    res.status(201).json({
      user,
      ...tokens
    });
  })
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const payload = refreshSchema.parse(req.body);
    const tokens = await rotateRefreshToken(payload.refreshToken, {
      userAgent: req.header("user-agent") ?? undefined,
      ipAddress: req.ip
    });

    res.json(tokens);
  })
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const payload = logoutSchema.parse(req.body);
    await revokeRefreshToken(payload.refreshToken);
    res.status(204).send();
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const auth = (res.locals as AuthenticatedLocals).auth;
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true
      }
    });

    if (!user) {
      throw new AppError("Unauthorized", 401);
    }

    res.json({ user });
  })
);
