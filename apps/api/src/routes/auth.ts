import { Router, type Request } from "express";
import { z } from "zod";
import { buildGoogleAuthorizationUrl, exchangeGoogleCode, getGoogleUserFromIdToken } from "../auth/google-oauth.js";
import { clearRefreshTokenCookie, parseCookies, REFRESH_TOKEN_COOKIE_NAME, setRefreshTokenCookie } from "../auth/cookies.js";
import { consumeOAuthState, createOAuthState, createPkceCodeChallenge } from "../auth/oauth-state.js";
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

const devSetPlanSchema = z.object({
  email: z.string().email(),
  plan: z.enum(["FREE", "PRO"])
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional()
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional()
});

export const authRouter = Router();

const googleStartSchema = z.object({
  client: z.literal("web").default("web"),
  redirect_uri: z.string().url().optional()
});

const googleCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1)
});

function getRefreshTokenFromRequest(req: Request, explicitToken?: string) {
  if (explicitToken) {
    return explicitToken;
  }

  const cookies = parseCookies(req.header("cookie"));
  return cookies[REFRESH_TOKEN_COOKIE_NAME];
}

function validateWebRedirectUri(redirectUri: string): string {
  const configured = new URL(env.WEB_AUTH_SUCCESS_REDIRECT);
  const candidate = new URL(redirectUri);
  if (candidate.origin !== configured.origin) {
    throw new AppError("Invalid redirect URI origin", 400);
  }
  return candidate.toString();
}

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
  "/dev-set-plan",
  asyncHandler(async (req, res) => {
    if (env.NODE_ENV === "production") {
      throw new AppError("Not found", 404);
    }

    const payload = devSetPlanSchema.parse(req.body);
    const existing = await prisma.user.findUnique({
      where: { email: payload.email },
      select: { id: true }
    });
    if (!existing) {
      throw new AppError("User not found", 404);
    }

    const user = await prisma.user.update({
      where: { email: payload.email },
      data: {
        plan: payload.plan
      },
      select: {
        id: true,
        email: true,
        plan: true
      }
    });

    res.json({ user });
  })
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const payload = refreshSchema.parse(req.body);
    const refreshToken = getRefreshTokenFromRequest(req, payload.refreshToken);
    if (!refreshToken) {
      throw new AppError("Refresh token required", 400);
    }

    const tokens = await rotateRefreshToken(refreshToken, {
      userAgent: req.header("user-agent") ?? undefined,
      ipAddress: req.ip
    });

    const usingCookie = !payload.refreshToken;
    if (usingCookie) {
      setRefreshTokenCookie(res, tokens.refreshToken, env.REFRESH_TOKEN_TTL_DAYS);
      res.json({
        accessToken: tokens.accessToken,
        accessTokenExpiresInSeconds: tokens.accessTokenExpiresInSeconds
      });
      return;
    }

    res.json(tokens);
  })
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const payload = logoutSchema.parse(req.body);
    const refreshToken = getRefreshTokenFromRequest(req, payload.refreshToken);
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
    clearRefreshTokenCookie(res);
    res.status(204).send();
  })
);

authRouter.get(
  "/google/start",
  asyncHandler(async (req, res) => {
    const params = googleStartSchema.parse(req.query);
    const redirectUri = validateWebRedirectUri(params.redirect_uri ?? env.WEB_AUTH_SUCCESS_REDIRECT);

    if (params.client !== "web") {
      throw new AppError("Unsupported client type", 400);
    }

    const { rawState, codeVerifier } = await createOAuthState(params.client, redirectUri);
    const authorizationUrl = buildGoogleAuthorizationUrl({
      state: rawState,
      codeChallenge: createPkceCodeChallenge(codeVerifier)
    });

    res.redirect(302, authorizationUrl);
  })
);

authRouter.get(
  "/google/callback",
  asyncHandler(async (req, res) => {
    try {
      const params = googleCallbackSchema.parse(req.query);

      const oauthState = await consumeOAuthState(params.state);

      const { idToken } = await exchangeGoogleCode({
        code: params.code,
        codeVerifier: oauthState.codeVerifier
      });

      const googleUser = await getGoogleUserFromIdToken(idToken);
      const user = await prisma.user.upsert({
        where: { email: googleUser.email },
        update: {
          name: googleUser.name
        },
        create: {
          email: googleUser.email,
          name: googleUser.name
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

      if (oauthState.client === "web") {
        setRefreshTokenCookie(res, tokens.refreshToken, env.REFRESH_TOKEN_TTL_DAYS);
        const redirect = new URL(oauthState.redirectUri);
        redirect.searchParams.set("login", "success");
        redirect.searchParams.set("source", "google");
        res.redirect(302, redirect.toString());
        return;
      }

      throw new AppError("Unsupported client type", 400);
    } catch (error) {
      const redirect = new URL(env.WEB_AUTH_FAILURE_REDIRECT);
      redirect.searchParams.set("login", "error");
      redirect.searchParams.set("provider", "google");
      if (error instanceof Error) {
        redirect.searchParams.set("reason", error.message);
      }
      res.redirect(302, redirect.toString());
    }
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
