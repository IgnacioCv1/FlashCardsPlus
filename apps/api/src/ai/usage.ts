import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

export function getCurrentMonthKey(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

async function getOrCreateMonthlyUsage(userId: string, monthKey: string) {
  return prisma.monthlyUsage.upsert({
    where: {
      userId_monthKey: {
        userId,
        monthKey
      }
    },
    update: {},
    create: {
      userId,
      monthKey
    }
  });
}

const devUnlimitedTesterEmails = new Set(
  env.DEV_UNLIMITED_TESTER_EMAILS.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0)
);

export function isUsageLimitBypassedForEmail(email?: string | null): boolean {
  if (env.NODE_ENV === "production") {
    return false;
  }
  if (!email) {
    return false;
  }
  return devUnlimitedTesterEmails.has(email.trim().toLowerCase());
}

export async function getUsageSnapshot(userId: string) {
  const monthKey = getCurrentMonthKey();
  const usage = await getOrCreateMonthlyUsage(userId, monthKey);
  return {
    monthKey,
    usage
  };
}

export async function ensureDocumentGenerationAvailable(
  userId: string,
  monthlyLimit: number,
  options?: { bypassLimit?: boolean }
) {
  if (options?.bypassLimit) {
    const { usage } = await getUsageSnapshot(userId);
    return {
      allowed: true,
      remaining: null,
      used: usage.documentGenerations
    };
  }

  const { usage } = await getUsageSnapshot(userId);
  if (usage.documentGenerations >= monthlyLimit) {
    return {
      allowed: false,
      remaining: 0,
      used: usage.documentGenerations
    };
  }
  return {
    allowed: true,
    remaining: monthlyLimit - usage.documentGenerations,
    used: usage.documentGenerations
  };
}

export async function incrementDocumentGeneration(userId: string, options?: { bypassLimit?: boolean }) {
  if (options?.bypassLimit) {
    const { usage } = await getUsageSnapshot(userId);
    return usage;
  }

  const monthKey = getCurrentMonthKey();
  return prisma.monthlyUsage.upsert({
    where: {
      userId_monthKey: {
        userId,
        monthKey
      }
    },
    update: {
      documentGenerations: {
        increment: 1
      }
    },
    create: {
      userId,
      monthKey,
      documentGenerations: 1
    }
  });
}

export async function ensureChatTurnAvailable(
  userId: string,
  monthlyLimit: number,
  options?: { bypassLimit?: boolean }
) {
  if (options?.bypassLimit) {
    const { usage } = await getUsageSnapshot(userId);
    return {
      allowed: true,
      remaining: null,
      used: usage.chatTurns
    };
  }

  const { usage } = await getUsageSnapshot(userId);
  if (usage.chatTurns >= monthlyLimit) {
    return {
      allowed: false,
      remaining: 0,
      used: usage.chatTurns
    };
  }
  return {
    allowed: true,
    remaining: monthlyLimit - usage.chatTurns,
    used: usage.chatTurns
  };
}

export async function incrementChatTurns(userId: string, turns = 1, options?: { bypassLimit?: boolean }) {
  if (options?.bypassLimit) {
    const { usage } = await getUsageSnapshot(userId);
    return usage;
  }

  const monthKey = getCurrentMonthKey();
  return prisma.monthlyUsage.upsert({
    where: {
      userId_monthKey: {
        userId,
        monthKey
      }
    },
    update: {
      chatTurns: {
        increment: turns
      }
    },
    create: {
      userId,
      monthKey,
      chatTurns: turns
    }
  });
}
