import type { PlanTier } from "@prisma/client";

export interface PlanPolicy {
  documentGenerationModel: string;
  gradingChatModel: string;
  monthlyDocumentGenerations: number;
  monthlyChatTurns: number;
}

const PLAN_POLICIES: Record<PlanTier, PlanPolicy> = {
  FREE: {
    documentGenerationModel: "gemini-2.5-flash-lite",
    gradingChatModel: "gemini-2.5-flash-lite",
    monthlyDocumentGenerations: 3,
    monthlyChatTurns: 150
  },
  PRO: {
    documentGenerationModel: "gemini-2.5-flash",
    gradingChatModel: "gemini-2.5-flash-lite",
    monthlyDocumentGenerations: 20,
    monthlyChatTurns: 800
  }
};

export function getPlanPolicy(plan: PlanTier): PlanPolicy {
  return PLAN_POLICIES[plan];
}
