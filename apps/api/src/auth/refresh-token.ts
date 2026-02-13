import { createHash, randomBytes } from "node:crypto";

export function generateRefreshTokenValue(): string {
  return randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function calculateRefreshTokenExpiry(ttlDays: number): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);
  return expiresAt;
}

export interface ClientInfo {
  userAgent?: string;
  ipAddress?: string;
}
