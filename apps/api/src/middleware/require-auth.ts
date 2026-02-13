import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../auth/jwt.js";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../lib/prisma.js";

export interface AuthenticatedLocals {
  auth: {
    userId: string;
    email: string | null;
  };
}

export async function requireAuth(req: Request, res: Response<unknown, AuthenticatedLocals>, next: NextFunction) {
  const authHeader = req.header("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return next(new AppError("Unauthorized", 401));
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const claims = verifyAccessToken(token);
  if (!claims) {
    return next(new AppError("Unauthorized", 401));
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: {
        id: true,
        email: true
      }
    });

    if (!user) {
      return next(new AppError("Unauthorized", 401));
    }

    res.locals.auth = {
      userId: user.id,
      email: user.email
    };

    return next();
  } catch (error) {
    return next(error);
  }
}
