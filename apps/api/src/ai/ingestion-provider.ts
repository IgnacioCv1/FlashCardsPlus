import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

export interface GenerateCardsInput {
  filename: string;
  mimeType: string;
  fileBuffer: Buffer;
  targetCards: number;
  model: string;
}

export interface GeneratedCard {
  question: string;
  answer: string;
}

export interface IngestionProvider {
  generateCardsFromDocument(input: GenerateCardsInput): Promise<GeneratedCard[]>;
}

class MockIngestionProvider implements IngestionProvider {
  async generateCardsFromDocument(input: GenerateCardsInput): Promise<GeneratedCard[]> {
    const base = input.filename.replace(/\.[^/.]+$/, "").trim() || "Document";
    return Array.from({ length: input.targetCards }, (_, index) => {
      const number = index + 1;
      return {
        question: `${base}: Key concept ${number}?`,
        answer: `Generated placeholder answer ${number} from ${input.mimeType}.`
      };
    });
  }
}

class GeminiIngestionProvider implements IngestionProvider {
  async generateCardsFromDocument(input: GenerateCardsInput): Promise<GeneratedCard[]> {
    if (!env.GEMINI_API_KEY) {
      throw new AppError("Missing GEMINI_API_KEY for Gemini provider", 500);
    }

    const prompt = [
      "You are an educational assistant.",
      `Create exactly ${input.targetCards} high-quality flashcards from the provided document.`,
      "Return ONLY valid JSON in this exact shape:",
      '{"cards":[{"question":"...","answer":"..."}]}',
      "Rules:",
      "- Questions must be clear and specific.",
      "- Answers must be concise and factually grounded in the document.",
      "- Do not include markdown, commentary, or extra keys."
    ].join("\n");

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: input.mimeType,
                data: input.fileBuffer.toString("base64")
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    };

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      input.model
    )}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const raw = (await response.json()) as GeminiGenerateResponse;
    if (!response.ok) {
      const message = raw.error?.message ?? "Gemini generation failed";
      throw new AppError(message, 502);
    }

    const text = raw.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!text) {
      throw new AppError("Gemini returned empty content", 502);
    }

    const parsed = safeParseCardPayload(text);
    if (!parsed || parsed.cards.length === 0) {
      throw new AppError("Gemini returned invalid card JSON", 502);
    }

    return parsed.cards
      .map((card) => ({
        question: card.question.trim(),
        answer: card.answer.trim()
      }))
      .filter((card) => card.question.length > 0 && card.answer.length > 0)
      .slice(0, input.targetCards);
  }
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface ParsedCardPayload {
  cards: Array<{
    question: string;
    answer: string;
  }>;
}

function safeParseCardPayload(text: string): ParsedCardPayload | null {
  try {
    const direct = JSON.parse(text) as ParsedCardPayload;
    if (Array.isArray(direct.cards)) {
      return direct;
    }
  } catch {
    // Continue to fenced/embedded JSON recovery.
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  try {
    const recovered = JSON.parse(text.slice(firstBrace, lastBrace + 1)) as ParsedCardPayload;
    if (Array.isArray(recovered.cards)) {
      return recovered;
    }
  } catch {
    return null;
  }

  return null;
}

export function getIngestionProvider(): IngestionProvider {
  if (env.AI_INGEST_PROVIDER === "mock") {
    return new MockIngestionProvider();
  }
  return new GeminiIngestionProvider();
}
