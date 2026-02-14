import { ReviewRating, type ScheduleState } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import {
  createEmptyCard,
  fsrs,
  Rating as FsrsRating,
  State as FsrsState,
  type Card as FsrsCard,
  type Grade as FsrsGrade
} from "ts-fsrs";
import { getPlanPolicy } from "../ai/policy.js";
import { getStudyAiProvider, type StudyChatMessage } from "../ai/study-provider.js";
import { ensureChatTurnAvailable, incrementChatTurns } from "../ai/usage.js";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../lib/prisma.js";
import type { AuthenticatedLocals } from "../middleware/require-auth.js";
import { asyncHandler } from "../utils/async-handler.js";

const deckIdParamsSchema = z.object({
  deckId: z.string().min(1)
});

const sessionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional()
});

const submitReviewBodySchema = z.object({
  cardId: z.string().min(1),
  rating: z.nativeEnum(ReviewRating)
});

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000)
});

const gradeAnswerBodySchema = z.object({
  cardId: z.string().min(1),
  userAnswer: z.string().trim().min(1).max(8000),
  history: z.array(chatMessageSchema).max(20).optional()
});

const followUpBodySchema = z.object({
  cardId: z.string().min(1),
  userMessage: z.string().trim().min(1).max(4000),
  history: z.array(chatMessageSchema).max(20).optional(),
  userAnswer: z.string().trim().min(1).max(8000).optional(),
  feedback: z.string().trim().min(1).max(5000).optional(),
  idealAnswer: z.string().trim().min(1).max(5000).optional()
});

const MIN_INTERVAL_MINUTES = 1;
const MIN_EASE_FACTOR = 1.3;
const fsrsScheduler = fsrs({
  enable_fuzz: false,
  enable_short_term: true
});
const studyAiProvider = getStudyAiProvider();

function normalizeFsrsState(value: number): FsrsState {
  if (value === FsrsState.New || value === FsrsState.Learning || value === FsrsState.Review || value === FsrsState.Relearning) {
    return value;
  }
  return FsrsState.New;
}

function mapReviewRatingToFsrsRating(rating: ReviewRating): FsrsGrade {
  if (rating === ReviewRating.AGAIN) {
    return FsrsRating.Again;
  }
  if (rating === ReviewRating.HARD) {
    return FsrsRating.Hard;
  }
  if (rating === ReviewRating.GOOD) {
    return FsrsRating.Good;
  }
  return FsrsRating.Easy;
}

function toFsrsCard(scheduleState: ScheduleState | null, now: Date): FsrsCard {
  if (!scheduleState) {
    return createEmptyCard(now);
  }

  const hasFsrsState = scheduleState.fsrsStability > 0 && scheduleState.fsrsDifficulty > 0;
  if (!hasFsrsState) {
    const inferredState = scheduleState.repetitions > 0 ? FsrsState.Review : FsrsState.New;
    const inferredScheduledDays = Math.max(0, Math.round(scheduleState.intervalMinutes / (24 * 60)));
    return {
      due: scheduleState.dueAt,
      stability: Math.max(0.1, inferredScheduledDays || 0.1),
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: inferredScheduledDays,
      learning_steps: 0,
      reps: scheduleState.repetitions,
      lapses: 0,
      state: inferredState,
      last_review: scheduleState.lastReviewedAt ?? undefined
    };
  }

  return {
    due: scheduleState.dueAt,
    stability: scheduleState.fsrsStability,
    difficulty: scheduleState.fsrsDifficulty,
    elapsed_days: scheduleState.fsrsElapsedDays,
    scheduled_days: scheduleState.fsrsScheduledDays,
    learning_steps: scheduleState.fsrsLearningSteps,
    reps: scheduleState.repetitions,
    lapses: scheduleState.fsrsLapses,
    state: normalizeFsrsState(scheduleState.fsrsState),
    last_review: scheduleState.lastReviewedAt ?? undefined
  };
}

function computeIntervalMinutes(from: Date, to: Date): number {
  return Math.max(MIN_INTERVAL_MINUTES, Math.round((to.getTime() - from.getTime()) / (60 * 1000)));
}

function deriveEaseFactorFromDifficulty(difficulty: number): number {
  const derived = (11 - difficulty) / 4;
  return Math.max(MIN_EASE_FACTOR, Math.round(derived * 1000) / 1000);
}

function mapScoreToReviewRating(score: number): ReviewRating {
  if (score < 40) {
    return ReviewRating.AGAIN;
  }
  if (score < 60) {
    return ReviewRating.HARD;
  }
  if (score < 85) {
    return ReviewRating.GOOD;
  }
  return ReviewRating.EASY;
}

async function getOwnedCardForStudy(userId: string, cardId: string) {
  return prisma.card.findFirst({
    where: {
      id: cardId,
      deck: {
        userId
      }
    },
    include: {
      scheduleState: true,
      deck: {
        select: {
          id: true,
          user: {
            select: {
              plan: true
            }
          }
        }
      }
    }
  });
}

function toStudyHistoryMessages(history: Array<{ role: "user" | "assistant"; content: string }> = []): StudyChatMessage[] {
  return history.map((message) => ({
    role: message.role,
    content: message.content
  }));
}

async function applyReviewForCard(input: {
  cardId: string;
  deckId: string;
  userId: string;
  scheduleState: ScheduleState | null;
  rating: ReviewRating;
  now: Date;
}) {
  const fsrsCard = toFsrsCard(input.scheduleState, input.now);
  const fsrsResult = fsrsScheduler.next(fsrsCard, input.now, mapReviewRatingToFsrsRating(input.rating));
  const nextCard = fsrsResult.card;
  const nextIntervalMinutes = computeIntervalMinutes(input.now, nextCard.due);
  const previousDueAt = input.scheduleState?.dueAt ?? null;
  const previousInterval = input.scheduleState?.intervalMinutes ?? 0;
  const nextEaseFactor = deriveEaseFactorFromDifficulty(nextCard.difficulty);

  return prisma.$transaction(async (tx) => {
    const scheduleState = await tx.scheduleState.upsert({
      where: {
        cardId: input.cardId
      },
      update: {
        dueAt: nextCard.due,
        lastReviewedAt: input.now,
        intervalMinutes: nextIntervalMinutes,
        repetitions: nextCard.reps,
        easeFactor: nextEaseFactor,
        fsrsState: nextCard.state,
        fsrsStability: nextCard.stability,
        fsrsDifficulty: nextCard.difficulty,
        fsrsElapsedDays: nextCard.elapsed_days,
        fsrsScheduledDays: nextCard.scheduled_days,
        fsrsLearningSteps: nextCard.learning_steps,
        fsrsLapses: nextCard.lapses
      },
      create: {
        cardId: input.cardId,
        dueAt: nextCard.due,
        lastReviewedAt: input.now,
        intervalMinutes: nextIntervalMinutes,
        repetitions: nextCard.reps,
        easeFactor: nextEaseFactor,
        fsrsState: nextCard.state,
        fsrsStability: nextCard.stability,
        fsrsDifficulty: nextCard.difficulty,
        fsrsElapsedDays: nextCard.elapsed_days,
        fsrsScheduledDays: nextCard.scheduled_days,
        fsrsLearningSteps: nextCard.learning_steps,
        fsrsLapses: nextCard.lapses
      }
    });

    const review = await tx.review.create({
      data: {
        userId: input.userId,
        deckId: input.deckId,
        cardId: input.cardId,
        rating: input.rating,
        previousDueAt,
        scheduledDueAt: nextCard.due,
        previousInterval,
        nextInterval: nextIntervalMinutes
      }
    });

    return {
      scheduleState,
      review
    };
  });
}

export const studyRouter = Router();

studyRouter.get(
  "/decks/:deckId/session",
  asyncHandler(async (req, res) => {
    const userId = (res.locals as AuthenticatedLocals).auth.userId;
    const { deckId } = deckIdParamsSchema.parse(req.params);
    const { limit } = sessionQuerySchema.parse(req.query);
    const take = limit ?? 20;
    const now = new Date();

    const deck = await prisma.deck.findFirst({
      where: {
        id: deckId,
        userId
      },
      select: {
        id: true,
        title: true
      }
    });

    if (!deck) {
      throw new AppError("Deck not found", 404);
    }

    const [dueScheduledCards, dueUnscheduledCards] = await Promise.all([
      prisma.card.findMany({
        where: {
          deckId,
          deck: {
            userId
          },
          scheduleState: {
            is: {
              dueAt: {
                lte: now
              }
            }
          }
        },
        include: {
          scheduleState: true
        },
        orderBy: {
          scheduleState: {
            dueAt: "asc"
          }
        },
        take
      }),
      prisma.card.findMany({
        where: {
          deckId,
          deck: {
            userId
          },
          scheduleState: {
            is: null
          }
        },
        include: {
          scheduleState: true
        },
        orderBy: {
          createdAt: "asc"
        },
        take
      })
    ]);

    const combinedDueCards = [...dueScheduledCards];
    for (const card of dueUnscheduledCards) {
      if (combinedDueCards.length >= take) {
        break;
      }
      if (combinedDueCards.some((candidate) => candidate.id === card.id)) {
        continue;
      }
      combinedDueCards.push(card);
    }

    const [dueScheduledCount, dueUnscheduledCount, nextDueCard] = await Promise.all([
      prisma.card.count({
        where: {
          deckId,
          deck: {
            userId
          },
          scheduleState: {
            is: {
              dueAt: {
                lte: now
              }
            }
          }
        }
      }),
      prisma.card.count({
        where: {
          deckId,
          deck: {
            userId
          },
          scheduleState: {
            is: null
          }
        }
      }),
      prisma.card.findFirst({
        where: {
          deckId,
          deck: {
            userId
          },
          scheduleState: {
            is: {
              dueAt: {
                gt: now
              }
            }
          }
        },
        include: {
          scheduleState: true
        },
        orderBy: {
          scheduleState: {
            dueAt: "asc"
          }
        }
      })
    ]);

    res.json({
      deck,
      dueNowCount: dueScheduledCount + dueUnscheduledCount,
      nextDueAt: nextDueCard?.scheduleState?.dueAt ?? null,
      cards: combinedDueCards.map((card) => ({
        id: card.id,
        question: card.question,
        answer: card.answer,
        scheduleState: card.scheduleState
          ? {
              dueAt: card.scheduleState.dueAt,
              lastReviewedAt: card.scheduleState.lastReviewedAt,
              intervalMinutes: card.scheduleState.intervalMinutes,
              repetitions: card.scheduleState.repetitions,
              easeFactor: card.scheduleState.easeFactor,
              fsrsState: card.scheduleState.fsrsState,
              fsrsDifficulty: card.scheduleState.fsrsDifficulty,
              fsrsStability: card.scheduleState.fsrsStability,
              fsrsScheduledDays: card.scheduleState.fsrsScheduledDays
            }
          : null
      }))
    });
  })
);

studyRouter.post(
  "/review",
  asyncHandler(async (req, res) => {
    const userId = (res.locals as AuthenticatedLocals).auth.userId;
    const payload = submitReviewBodySchema.parse(req.body);
    const now = new Date();

    const card = await getOwnedCardForStudy(userId, payload.cardId);

    if (!card) {
      throw new AppError("Card not found", 404);
    }

    const result = await applyReviewForCard({
      cardId: card.id,
      deckId: card.deck.id,
      userId,
      scheduleState: card.scheduleState,
      rating: payload.rating,
      now
    });

    res.status(201).json({
      cardId: card.id,
      rating: payload.rating,
      scheduleState: {
        dueAt: result.scheduleState.dueAt,
        lastReviewedAt: result.scheduleState.lastReviewedAt,
        intervalMinutes: result.scheduleState.intervalMinutes,
        repetitions: result.scheduleState.repetitions,
        easeFactor: result.scheduleState.easeFactor
      },
      review: {
        id: result.review.id,
        previousDueAt: result.review.previousDueAt,
        scheduledDueAt: result.review.scheduledDueAt,
        previousInterval: result.review.previousInterval,
        nextInterval: result.review.nextInterval,
        createdAt: result.review.createdAt
      }
    });
  })
);

studyRouter.post(
  "/grade",
  asyncHandler(async (req, res) => {
    const userId = (res.locals as AuthenticatedLocals).auth.userId;
    const payload = gradeAnswerBodySchema.parse(req.body);
    const card = await getOwnedCardForStudy(userId, payload.cardId);

    if (!card) {
      throw new AppError("Card not found", 404);
    }

    const planPolicy = getPlanPolicy(card.deck.user.plan);
    const quotaCheck = await ensureChatTurnAvailable(userId, planPolicy.monthlyChatTurns);
    if (!quotaCheck.allowed) {
      throw new AppError("Monthly AI chat turn limit reached for current plan", 403);
    }

    const grading = await studyAiProvider.gradeAnswer({
      question: card.question,
      expectedAnswer: card.answer,
      userAnswer: payload.userAnswer,
      history: toStudyHistoryMessages(payload.history),
      model: planPolicy.gradingChatModel
    });

    const rating = mapScoreToReviewRating(grading.score);
    const now = new Date();
    const result = await applyReviewForCard({
      cardId: card.id,
      deckId: card.deck.id,
      userId,
      scheduleState: card.scheduleState,
      rating,
      now
    });
    const usage = await incrementChatTurns(userId);

    res.status(201).json({
      cardId: card.id,
      grading: {
        score: grading.score,
        rating,
        feedback: grading.feedback,
        idealAnswer: grading.idealAnswer,
        assistantReply: grading.assistantReply
      },
      scheduleState: {
        dueAt: result.scheduleState.dueAt,
        lastReviewedAt: result.scheduleState.lastReviewedAt,
        intervalMinutes: result.scheduleState.intervalMinutes,
        repetitions: result.scheduleState.repetitions,
        easeFactor: result.scheduleState.easeFactor
      },
      review: {
        id: result.review.id,
        previousDueAt: result.review.previousDueAt,
        scheduledDueAt: result.review.scheduledDueAt,
        previousInterval: result.review.previousInterval,
        nextInterval: result.review.nextInterval,
        createdAt: result.review.createdAt
      },
      usage: {
        chatTurns: usage.chatTurns,
        remainingMonthlyChatTurns: Math.max(0, planPolicy.monthlyChatTurns - usage.chatTurns)
      }
    });
  })
);

studyRouter.post(
  "/follow-up",
  asyncHandler(async (req, res) => {
    const userId = (res.locals as AuthenticatedLocals).auth.userId;
    const payload = followUpBodySchema.parse(req.body);
    const card = await getOwnedCardForStudy(userId, payload.cardId);

    if (!card) {
      throw new AppError("Card not found", 404);
    }

    const planPolicy = getPlanPolicy(card.deck.user.plan);
    const quotaCheck = await ensureChatTurnAvailable(userId, planPolicy.monthlyChatTurns);
    if (!quotaCheck.allowed) {
      throw new AppError("Monthly AI chat turn limit reached for current plan", 403);
    }

    const assistantMessage = await studyAiProvider.followUp({
      question: card.question,
      expectedAnswer: card.answer,
      userMessage: payload.userMessage,
      history: toStudyHistoryMessages(payload.history),
      userAnswer: payload.userAnswer,
      feedback: payload.feedback,
      idealAnswer: payload.idealAnswer,
      model: planPolicy.gradingChatModel
    });
    const usage = await incrementChatTurns(userId);

    res.json({
      cardId: card.id,
      assistantMessage,
      usage: {
        chatTurns: usage.chatTurns,
        remainingMonthlyChatTurns: Math.max(0, planPolicy.monthlyChatTurns - usage.chatTurns)
      }
    });
  })
);
