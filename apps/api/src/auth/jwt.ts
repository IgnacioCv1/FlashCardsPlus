import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

interface AccessTokenPayload {
  sub: string;
  email: string | null;
  type: "access";
}

interface JwtClaims extends AccessTokenPayload {
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

const JWT_HEADER = {
  alg: "HS256",
  typ: "JWT"
} as const;

const ISSUER = "flashcards-api";
const AUDIENCE = "flashcards-clients";

function toBase64Url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function fromBase64Url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

function signSegment(input: string): string {
  return createHmac("sha256", env.JWT_ACCESS_SECRET).update(input).digest("base64url");
}

export function createAccessToken(payload: AccessTokenPayload): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: JwtClaims = {
    ...payload,
    iat: now,
    exp: now + env.JWT_ACCESS_EXPIRES_IN_SECONDS,
    iss: ISSUER,
    aud: AUDIENCE
  };

  const encodedHeader = toBase64Url(JSON.stringify(JWT_HEADER));
  const encodedPayload = toBase64Url(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signSegment(signingInput);
  return `${signingInput}.${signature}`;
}

export function verifyAccessToken(token: string): JwtClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = signSegment(signingInput);

  const actualBuffer = fromBase64Url(encodedSignature);
  const expectedBuffer = fromBase64Url(expectedSignature);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const decodedHeader = JSON.parse(fromBase64Url(encodedHeader).toString("utf8")) as { alg?: string; typ?: string };
    if (decodedHeader.alg !== JWT_HEADER.alg || decodedHeader.typ !== JWT_HEADER.typ) {
      return null;
    }

    const claims = JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as JwtClaims;
    const now = Math.floor(Date.now() / 1000);
    if (claims.type !== "access") {
      return null;
    }
    if (claims.iss !== ISSUER || claims.aud !== AUDIENCE) {
      return null;
    }
    if (typeof claims.exp !== "number" || claims.exp <= now) {
      return null;
    }
    if (typeof claims.sub !== "string" || claims.sub.length === 0) {
      return null;
    }

    return claims;
  } catch {
    return null;
  }
}
