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

export async function getUsageSnapshot(userId: string) {
  const monthKey = getCurrentMonthKey();
  const usage = await getOrCreateMonthlyUsage(userId, monthKey);
  return {
    monthKey,
    usage
  };
}

export async function ensureDocumentGenerationAvailable(userId: string, monthlyLimit: number) {
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

export async function incrementDocumentGeneration(userId: string) {
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
