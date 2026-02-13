import type { Response } from "express";

export const REFRESH_TOKEN_COOKIE_NAME = "flashcards_rt";

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawName, ...rest] = part.trim().split("=");
    if (!rawName || rest.length === 0) {
      return acc;
    }
    acc[rawName] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

export function setRefreshTokenCookie(res: Response, refreshToken: string, ttlDays: number) {
  const maxAge = ttlDays * 24 * 60 * 60;
  const isSecure = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `${REFRESH_TOKEN_COOKIE_NAME}=${encodeURIComponent(
      refreshToken
    )}; HttpOnly; Path=/auth; SameSite=Lax; Max-Age=${maxAge}${isSecure ? "; Secure" : ""}`
  );
}

export function clearRefreshTokenCookie(res: Response) {
  const isSecure = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `${REFRESH_TOKEN_COOKIE_NAME}=; HttpOnly; Path=/auth; SameSite=Lax; Max-Age=0${isSecure ? "; Secure" : ""}`
  );
}
