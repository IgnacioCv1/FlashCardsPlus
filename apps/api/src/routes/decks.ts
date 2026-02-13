import { Router } from "express";
import {
  cardCreateSchema,
  deckCardsParamsSchema,
  deckCreateSchema,
  deckIdParamsSchema,
  deckUpdateSchema
} from "@flashcards/shared";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../lib/prisma.js";
import type { AuthenticatedLocals } from "../middleware/require-auth.js";
import { asyncHandler } from "../utils/async-handler.js";

export const decksRouter = Router();

decksRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const userId = (res.locals as AuthenticatedLocals).auth.userId;

    const decks = await prisma.deck.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: {
            cards: true
          }
        }
      }
    });

    res.json(decks);
  })
);

decksRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (res.locals as AuthenticatedLocals).auth.userId;
    const payload = deckCreateSchema.parse(req.body);

    const deck = await prisma.deck.create({
      data: {
        userId,
        title: payload.title,
        description: payload.description
      }
    });

    res.status(201).json(deck);
  })
);

decksRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (res.locals as AuthenticatedLocals).auth.userId;
    const { id } = deckIdParamsSchema.parse(req.params);

    const deck = await prisma.deck.findFirst({
      where: {
        id,
        userId
      },
      include: {
        cards: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!deck) {
      throw new AppError("Deck not found", 404);
    }

    res.json(deck);
  })
);

decksRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (res.locals as AuthenticatedLocals).auth.userId;
    const { id } = deckIdParamsSchema.parse(req.params);
    const payload = deckUpdateSchema.parse(req.body);

    const existingDeck = await prisma.deck.findFirst({
      where: {
        id,
        userId
      },
      select: { id: true }
    });

    if (!existingDeck) {
      throw new AppError("Deck not found", 404);
    }

    const updatedDeck = await prisma.deck.update({
      where: { id },
      data: {
        ...(payload.title !== undefined ? { title: payload.title } : {}),
        ...(payload.description !== undefined ? { description: payload.description } : {})
      }
    });

    res.json(updatedDeck);
  })
);

decksRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (res.locals as AuthenticatedLocals).auth.userId;
    const { id } = deckIdParamsSchema.parse(req.params);

    const existingDeck = await prisma.deck.findFirst({
      where: {
        id,
        userId
      },
      select: { id: true }
    });

    if (!existingDeck) {
      throw new AppError("Deck not found", 404);
    }

    await prisma.deck.delete({
      where: { id }
    });

    res.status(204).send();
  })
);

decksRouter.get(
  "/:id/cards",
  asyncHandler(async (req, res) => {
    const userId = (res.locals as AuthenticatedLocals).auth.userId;
    const { id } = deckCardsParamsSchema.parse(req.params);

    const deck = await prisma.deck.findFirst({
      where: {
        id,
        userId
      },
      select: { id: true }
    });

    if (!deck) {
      throw new AppError("Deck not found", 404);
    }

    const cards = await prisma.card.findMany({
      where: {
        deckId: id
      },
      orderBy: { createdAt: "asc" }
    });

    res.json(cards);
  })
);

decksRouter.post(
  "/:id/cards",
  asyncHandler(async (req, res) => {
    const userId = (res.locals as AuthenticatedLocals).auth.userId;
    const { id } = deckCardsParamsSchema.parse(req.params);
    const payload = cardCreateSchema.parse(req.body);

    const deck = await prisma.deck.findFirst({
      where: {
        id,
        userId
      },
      select: { id: true }
    });

    if (!deck) {
      throw new AppError("Deck not found", 404);
    }

    const card = await prisma.card.create({
      data: {
        deckId: id,
        question: payload.question,
        answer: payload.answer
      }
    });

    res.status(201).json(card);
  })
);
