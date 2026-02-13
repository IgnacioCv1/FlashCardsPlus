import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../lib/prisma.js";
import { calculateRefreshTokenExpiry, type ClientInfo, generateRefreshTokenValue, hashRefreshToken } from "./refresh-token.js";
import { createAccessToken } from "./jwt.js";

interface UserIdentity {
  id: string;
  email: string | null;
}

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
}

export async function issueTokenPair(user: UserIdentity, clientInfo: ClientInfo): Promise<AuthTokenPair> {
  const refreshToken = generateRefreshTokenValue();
  const tokenHash = hashRefreshToken(refreshToken);
  const familyId = randomUUID();

  await prisma.refreshToken.create({
    data: {
      tokenHash,
      familyId,
      userId: user.id,
      expiresAt: calculateRefreshTokenExpiry(env.REFRESH_TOKEN_TTL_DAYS),
      userAgent: clientInfo.userAgent,
      ipAddress: clientInfo.ipAddress
    }
  });

  return {
    accessToken: createAccessToken({
      sub: user.id,
      email: user.email,
      type: "access"
    }),
    refreshToken,
    accessTokenExpiresInSeconds: env.JWT_ACCESS_EXPIRES_IN_SECONDS
  };
}

export async function rotateRefreshToken(rawRefreshToken: string, clientInfo: ClientInfo): Promise<AuthTokenPair> {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true
        }
      }
    }
  });

  if (!existing || existing.revokedAt || existing.expiresAt <= new Date()) {
    throw new AppError("Invalid refresh token", 401);
  }

  const newRefreshToken = generateRefreshTokenValue();
  const newTokenHash = hashRefreshToken(newRefreshToken);
  const expiresAt = calculateRefreshTokenExpiry(env.REFRESH_TOKEN_TTL_DAYS);

  const replacement = await prisma.refreshToken.create({
    data: {
      tokenHash: newTokenHash,
      familyId: existing.familyId,
      userId: existing.userId,
      expiresAt,
      userAgent: clientInfo.userAgent,
      ipAddress: clientInfo.ipAddress
    }
  });

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: {
      revokedAt: new Date(),
      replacedByTokenId: replacement.id
    }
  });

  return {
    accessToken: createAccessToken({
      sub: existing.user.id,
      email: existing.user.email,
      type: "access"
    }),
    refreshToken: newRefreshToken,
    accessTokenExpiresInSeconds: env.JWT_ACCESS_EXPIRES_IN_SECONDS
  };
}

export async function revokeRefreshToken(rawRefreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      revokedAt: true
    }
  });

  if (!existing || existing.revokedAt) {
    return;
  }

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: {
      revokedAt: new Date()
    }
  });
}
