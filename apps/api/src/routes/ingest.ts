import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { getIngestionProvider } from "../ai/ingestion-provider.js";
import { getPlanPolicy } from "../ai/policy.js";
import { ensureDocumentGenerationAvailable, incrementDocumentGeneration } from "../ai/usage.js";
import { AppError } from "../errors/app-error.js";
import { deleteExpiredIngestionDrafts } from "../ingest/draft-cleanup.js";
import { prisma } from "../lib/prisma.js";
import type { AuthenticatedLocals } from "../middleware/require-auth.js";
import { asyncHandler } from "../utils/async-handler.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024
  }
});

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

const generateCardsBodySchema = z.object({
  deckId: z.string().min(1),
  targetCards: z.coerce.number().int().min(1).max(30).optional()
});

const previewIdParamsSchema = z.object({
  previewId: z.string().min(1)
});

const commitPreviewBodySchema = z.object({
  cards: z
    .array(
      z.object({
        id: z.string().min(1),
        keep: z.boolean(),
        question: z.string().trim().min(1).max(2000),
        answer: z.string().trim().min(1).max(5000)
      })
    )
    .min(1)
});

export const ingestRouter = Router();

async function cleanupExpiredDraftsBestEffort() {
  try {
    await deleteExpiredIngestionDrafts();
  } catch {
    // Cleanup should not block user requests.
  }
}

async function getOwnedDeck(userId: string, deckId: string) {
  const deck = await prisma.deck.findFirst({
    where: {
      id: deckId,
      userId
    },
    select: {
      id: true,
      user: {
        select: {
          plan: true
        }
      }
    }
  });

  if (!deck) {
    throw new AppError("Deck not found", 404);
  }

  return deck;
}

async function getPendingPreviewForUser(userId: string, previewId: string) {
  const preview = await prisma.ingestionDraft.findFirst({
    where: {
      id: previewId,
      userId
    },
    include: {
      cards: {
        orderBy: { position: "asc" }
      }
    }
  });

  if (!preview) {
    throw new AppError("Preview not found", 404);
  }

  if (preview.status !== "PENDING") {
    throw new AppError("Preview is no longer pending", 400);
  }

  if (preview.expiresAt.getTime() <= Date.now()) {
    await prisma.ingestionDraft.update({
      where: { id: preview.id },
      data: { status: "DISCARDED" }
    });
    throw new AppError("Preview expired", 410);
  }

  return preview;
}

async function handleGeneratePreview(req: Request, res: Response) {
  await cleanupExpiredDraftsBestEffort();

  const userId = (res.locals as AuthenticatedLocals).auth.userId;
  const payload = generateCardsBodySchema.parse(req.body);
  const file = req.file;

  if (!file) {
    throw new AppError("File is required", 400);
  }

  if (!allowedMimeTypes.has(file.mimetype)) {
    throw new AppError("Unsupported file type. Only PDF and DOCX are allowed.", 400);
  }

  const deck = await getOwnedDeck(userId, payload.deckId);
  const plan = deck.user.plan;
  const planPolicy = getPlanPolicy(plan);
  const quotaCheck = await ensureDocumentGenerationAvailable(userId, planPolicy.monthlyDocumentGenerations);
  if (!quotaCheck.allowed) {
    throw new AppError("Monthly document generation limit reached for current plan", 403);
  }

  const provider = getIngestionProvider();
  const generatedCards = await provider.generateCardsFromDocument({
    filename: file.originalname,
    mimeType: file.mimetype,
    fileBuffer: file.buffer,
    targetCards: payload.targetCards,
    model: planPolicy.documentGenerationModel
  });

  if (generatedCards.length === 0) {
    throw new AppError("Provider returned no cards", 502);
  }

  const preview = await prisma.ingestionDraft.create({
    data: {
      userId,
      deckId: deck.id,
      filename: file.originalname,
      mimeType: file.mimetype,
      plan,
      modelUsed: planPolicy.documentGenerationModel,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      cards: {
        create: generatedCards.map((card, index) => ({
          position: index,
          question: card.question,
          answer: card.answer
        }))
      }
    },
    include: {
      cards: {
        orderBy: { position: "asc" }
      }
    }
  });

  const usage = await incrementDocumentGeneration(userId);

  res.status(201).json({
    preview: {
      id: preview.id,
      deckId: preview.deckId,
      filename: preview.filename,
      mimeType: preview.mimeType,
      status: preview.status,
      expiresAt: preview.expiresAt,
      createdAt: preview.createdAt,
      plan: preview.plan,
      modelUsed: preview.modelUsed,
      cards: preview.cards
    },
    generatedCount: preview.cards.length,
    remainingMonthlyDocumentGenerations: Math.max(0, planPolicy.monthlyDocumentGenerations - usage.documentGenerations)
  });
}

ingestRouter.post(
  "/generate-preview",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    await handleGeneratePreview(req, res);
  })
);

ingestRouter.post(
  "/generate-cards",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    await handleGeneratePreview(req, res);
  })
);

ingestRouter.get(
  "/previews/:previewId",
  asyncHandler(async (req, res) => {
    await cleanupExpiredDraftsBestEffort();

    const userId = (res.locals as AuthenticatedLocals).auth.userId;
    const { previewId } = previewIdParamsSchema.parse(req.params);
    const preview = await getPendingPreviewForUser(userId, previewId);

    res.json({
      preview: {
        id: preview.id,
        deckId: preview.deckId,
        filename: preview.filename,
        mimeType: preview.mimeType,
        status: preview.status,
        expiresAt: preview.expiresAt,
        createdAt: preview.createdAt,
        plan: preview.plan,
        modelUsed: preview.modelUsed,
        cards: preview.cards
      }
    });
  })
);

ingestRouter.post(
  "/previews/:previewId/commit",
  asyncHandler(async (req, res) => {
    await cleanupExpiredDraftsBestEffort();

    const userId = (res.locals as AuthenticatedLocals).auth.userId;
    const { previewId } = previewIdParamsSchema.parse(req.params);
    const payload = commitPreviewBodySchema.parse(req.body);
    const preview = await getPendingPreviewForUser(userId, previewId);

    const previewCardIds = preview.cards.map((card) => card.id);
    const payloadCardIds = payload.cards.map((card) => card.id);
    const uniquePayloadCardIds = new Set(payloadCardIds);
    if (uniquePayloadCardIds.size !== payload.cards.length) {
      throw new AppError("Duplicate card IDs in preview commit payload", 400);
    }

    if (payload.cards.length !== preview.cards.length) {
      throw new AppError("Preview commit payload must include all preview cards", 400);
    }

    for (const cardId of previewCardIds) {
      if (!uniquePayloadCardIds.has(cardId)) {
        throw new AppError("Preview commit payload does not match preview cards", 400);
      }
    }

    const keptCards = payload.cards
      .filter((card) => card.keep)
      .map((card) => ({
        id: card.id,
        question: card.question.trim(),
        answer: card.answer.trim()
      }));

    for (const card of keptCards) {
      if (card.question.length === 0 || card.answer.length === 0) {
        throw new AppError("Kept cards must include non-empty question and answer", 400);
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const card of payload.cards) {
        await tx.ingestionDraftCard.update({
          where: { id: card.id },
          data: {
            question: card.question.trim(),
            answer: card.answer.trim()
          }
        });
      }

      if (keptCards.length > 0) {
        await tx.card.createMany({
          data: keptCards.map((card) => ({
            deckId: preview.deckId,
            question: card.question,
            answer: card.answer
          }))
        });
      }

      await tx.ingestionDraft.update({
        where: { id: preview.id },
        data: {
          status: "COMMITTED",
          committedAt: new Date()
        }
      });
    });

    res.status(201).json({
      previewId: preview.id,
      deckId: preview.deckId,
      committedCount: keptCards.length,
      discardedCount: payload.cards.length - keptCards.length
    });
  })
);

ingestRouter.delete(
  "/previews/:previewId",
  asyncHandler(async (req, res) => {
    await cleanupExpiredDraftsBestEffort();

    const userId = (res.locals as AuthenticatedLocals).auth.userId;
    const { previewId } = previewIdParamsSchema.parse(req.params);
    const preview = await getPendingPreviewForUser(userId, previewId);

    await prisma.ingestionDraft.update({
      where: { id: preview.id },
      data: { status: "DISCARDED" }
    });

    res.status(204).send();
  })
);
