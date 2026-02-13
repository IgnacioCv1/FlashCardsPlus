import { z } from "zod";

export const healthResponseSchema = z.object({
  ok: z.literal(true)
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const deckIdParamsSchema = z.object({
  id: z.string().min(1)
});

export const deckCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional()
});

export const deckUpdateSchema = deckCreateSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided"
});

export const cardIdParamsSchema = z.object({
  id: z.string().min(1)
});

export const deckCardsParamsSchema = z.object({
  id: z.string().min(1)
});

export const cardCreateSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  answer: z.string().trim().min(1).max(5000)
});

export const cardUpdateSchema = cardCreateSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided"
});

export type DeckCreateInput = z.infer<typeof deckCreateSchema>;
export type DeckUpdateInput = z.infer<typeof deckUpdateSchema>;
export type CardCreateInput = z.infer<typeof cardCreateSchema>;
export type CardUpdateInput = z.infer<typeof cardUpdateSchema>;
