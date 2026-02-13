import { Router } from "express";
import { cardIdParamsSchema, cardUpdateSchema } from "@flashcards/shared";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../lib/prisma.js";
import type { AuthenticatedLocals } from "../middleware/require-auth.js";
import { asyncHandler } from "../utils/async-handler.js";

export const cardsRouter = Router();

cardsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (res.locals as AuthenticatedLocals).auth.userId;
    const { id } = cardIdParamsSchema.parse(req.params);

    const card = await prisma.card.findFirst({
      where: {
        id,
        deck: {
          userId
        }
      }
    });

    if (!card) {
      throw new AppError("Card not found", 404);
    }

    res.json(card);
  })
);

cardsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (res.locals as AuthenticatedLocals).auth.userId;
    const { id } = cardIdParamsSchema.parse(req.params);
    const payload = cardUpdateSchema.parse(req.body);

    const existingCard = await prisma.card.findFirst({
      where: {
        id,
        deck: {
          userId
        }
      },
      select: { id: true }
    });

    if (!existingCard) {
      throw new AppError("Card not found", 404);
    }

    const card = await prisma.card.update({
      where: { id },
      data: {
        ...(payload.question !== undefined ? { question: payload.question } : {}),
        ...(payload.answer !== undefined ? { answer: payload.answer } : {})
      }
    });

    res.json(card);
  })
);

cardsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (res.locals as AuthenticatedLocals).auth.userId;
    const { id } = cardIdParamsSchema.parse(req.params);

    const existingCard = await prisma.card.findFirst({
      where: {
        id,
        deck: {
          userId
        }
      },
      select: { id: true }
    });

    if (!existingCard) {
      throw new AppError("Card not found", 404);
    }

    await prisma.card.delete({
      where: { id }
    });

    res.status(204).send();
  })
);
