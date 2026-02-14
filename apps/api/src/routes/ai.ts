import { Router } from "express";
import { getPlanPolicy } from "../ai/policy.js";
import { getUsageSnapshot, isUsageLimitBypassedForEmail } from "../ai/usage.js";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../lib/prisma.js";
import type { AuthenticatedLocals } from "../middleware/require-auth.js";
import { asyncHandler } from "../utils/async-handler.js";

export const aiRouter = Router();

aiRouter.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    const userId = (res.locals as AuthenticatedLocals).auth.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        plan: true,
        email: true
      }
    });

    if (!user) {
      throw new AppError("Unauthorized", 401);
    }

    const policy = getPlanPolicy(user.plan);
    const { monthKey, usage } = await getUsageSnapshot(user.id);
    const bypassUsageLimit = isUsageLimitBypassedForEmail(user.email);

    res.json({
      plan: user.plan,
      monthKey,
      isUsageLimitBypassed: bypassUsageLimit,
      models: {
        documentGeneration: policy.documentGenerationModel,
        gradingAndChat: policy.gradingChatModel
      },
      limits: {
        documentGenerations: bypassUsageLimit ? null : policy.monthlyDocumentGenerations,
        chatTurns: bypassUsageLimit ? null : policy.monthlyChatTurns
      },
      usage: {
        documentGenerations: usage.documentGenerations,
        chatTurns: usage.chatTurns
      },
      remaining: {
        documentGenerations: bypassUsageLimit ? null : Math.max(0, policy.monthlyDocumentGenerations - usage.documentGenerations),
        chatTurns: bypassUsageLimit ? null : Math.max(0, policy.monthlyChatTurns - usage.chatTurns)
      }
    });
  })
);
