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

const MIN_INTERVAL_MINUTES = 1;
const MIN_EASE_FACTOR = 1.3;
const fsrsScheduler = fsrs({
  enable_fuzz: false,
  enable_short_term: true
});

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

    const card = await prisma.card.findFirst({
      where: {
        id: payload.cardId,
        deck: {
          userId
        }
      },
      include: {
        scheduleState: true,
        deck: {
          select: {
            id: true
          }
        }
      }
    });

    if (!card) {
      throw new AppError("Card not found", 404);
    }

    const fsrsCard = toFsrsCard(card.scheduleState, now);
    const fsrsResult = fsrsScheduler.next(fsrsCard, now, mapReviewRatingToFsrsRating(payload.rating));
    const nextCard = fsrsResult.card;
    const nextIntervalMinutes = computeIntervalMinutes(now, nextCard.due);
    const previousDueAt = card.scheduleState?.dueAt ?? null;
    const previousInterval = card.scheduleState?.intervalMinutes ?? 0;
    const nextEaseFactor = deriveEaseFactorFromDifficulty(nextCard.difficulty);

    const result = await prisma.$transaction(async (tx) => {
      const scheduleState = await tx.scheduleState.upsert({
        where: {
          cardId: card.id
        },
        update: {
          dueAt: nextCard.due,
          lastReviewedAt: now,
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
          cardId: card.id,
          dueAt: nextCard.due,
          lastReviewedAt: now,
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
          userId,
          deckId: card.deck.id,
          cardId: card.id,
          rating: payload.rating,
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
