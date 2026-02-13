import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { getIngestionProvider } from "../ai/ingestion-provider.js";
import { getPlanPolicy } from "../ai/policy.js";
import { ensureDocumentGenerationAvailable, incrementDocumentGeneration } from "../ai/usage.js";
import { AppError } from "../errors/app-error.js";
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

export const ingestRouter = Router();

ingestRouter.post(
  "/generate-cards",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const userId = (res.locals as AuthenticatedLocals).auth.userId;
    const payload = generateCardsBodySchema.parse(req.body);
    const file = req.file;

    if (!file) {
      throw new AppError("File is required", 400);
    }

    if (!allowedMimeTypes.has(file.mimetype)) {
      throw new AppError("Unsupported file type. Only PDF and DOCX are allowed.", 400);
    }

    const deck = await prisma.deck.findFirst({
      where: {
        id: payload.deckId,
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
      targetCards: payload.targetCards ?? 8,
      model: planPolicy.documentGenerationModel
    });

    const createdCards = await Promise.all(
      generatedCards.map((card) =>
        prisma.card.create({
          data: {
            deckId: deck.id,
            question: card.question,
            answer: card.answer
          }
        })
      )
    );
    const usage = await incrementDocumentGeneration(userId);

    res.status(201).json({
      deckId: deck.id,
      filename: file.originalname,
      mimeType: file.mimetype,
      plan,
      modelUsed: planPolicy.documentGenerationModel,
      createdCount: createdCards.length,
      remainingMonthlyDocumentGenerations: Math.max(0, planPolicy.monthlyDocumentGenerations - usage.documentGenerations),
      cards: createdCards
    });
  })
);
