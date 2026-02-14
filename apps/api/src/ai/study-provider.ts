import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

export type StudyChatRole = "user" | "assistant";

export interface StudyChatMessage {
  role: StudyChatRole;
  content: string;
}

export interface GradeStudyAnswerInput {
  question: string;
  expectedAnswer: string;
  userAnswer: string;
  history: StudyChatMessage[];
  model: string;
}

export interface GradeStudyAnswerResult {
  score: number;
  feedback: string;
  idealAnswer: string;
  assistantReply: string;
}

export interface StudyFollowUpInput {
  question: string;
  expectedAnswer: string;
  userMessage: string;
  history: StudyChatMessage[];
  userAnswer?: string;
  feedback?: string;
  idealAnswer?: string;
  model: string;
}

export interface StudyAiProvider {
  gradeAnswer(input: GradeStudyAnswerInput): Promise<GradeStudyAnswerResult>;
  followUp(input: StudyFollowUpInput): Promise<string>;
}

const gradeResponseSchema = z.object({
  score: z.number().int().min(0).max(100),
  feedback: z.string().trim().min(1).max(5000),
  idealAnswer: z.string().trim().min(1).max(5000),
  assistantReply: z.string().trim().min(1).max(5000)
});

const followUpResponseSchema = z.object({
  assistantReply: z.string().trim().min(1).max(6000)
});

class MockStudyAiProvider implements StudyAiProvider {
  async gradeAnswer(input: GradeStudyAnswerInput): Promise<GradeStudyAnswerResult> {
    const score = scoreAnswer(input.expectedAnswer, input.userAnswer);
    const feedback =
      score >= 85
        ? "Strong recall. You covered most of the key points accurately."
        : score >= 60
          ? "Decent recall. You captured the core idea but missed key details."
          : score >= 40
            ? "Partial recall. Review the definition and key relationships."
            : "Low recall. Re-study this card and try to restate the core concept in your own words.";

    return {
      score,
      feedback,
      idealAnswer: input.expectedAnswer.trim(),
      assistantReply: `Score: ${score}/100. ${feedback}`
    };
  }

  async followUp(input: StudyFollowUpInput): Promise<string> {
    return [
      "Follow-up guidance:",
      `For "${input.question}", focus on the exact key idea in the ideal answer.`,
      `Your question: ${input.userMessage}`
    ].join(" ");
  }
}

class GeminiStudyAiProvider implements StudyAiProvider {
  async gradeAnswer(input: GradeStudyAnswerInput): Promise<GradeStudyAnswerResult> {
    if (!env.GEMINI_API_KEY) {
      throw new AppError("Missing GEMINI_API_KEY for Gemini provider", 500);
    }

    const historyText = toHistoryText(input.history);
    const prompt = [
      "You are grading a student's flashcard answer.",
      "Return ONLY JSON in this exact shape:",
      '{"score":0,"feedback":"...","idealAnswer":"...","assistantReply":"..."}',
      "Rules:",
      "- score must be an integer from 0 to 100.",
      "- feedback must be concise and actionable.",
      "- idealAnswer should be the corrected best answer.",
      "- assistantReply should be a short chat-style summary for the learner.",
      "",
      `Question: ${input.question}`,
      `Expected answer: ${input.expectedAnswer}`,
      `Student answer: ${input.userAnswer}`,
      historyText ? `Recent conversation:\n${historyText}` : ""
    ]
      .filter((line) => line.length > 0)
      .join("\n");

    const raw = await callGeminiJson(input.model, prompt);
    const parsed = gradeResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError("Gemini returned invalid grading JSON", 502);
    }

    return parsed.data;
  }

  async followUp(input: StudyFollowUpInput): Promise<string> {
    if (!env.GEMINI_API_KEY) {
      throw new AppError("Missing GEMINI_API_KEY for Gemini provider", 500);
    }

    const historyText = toHistoryText(input.history);
    const context = [
      `Question: ${input.question}`,
      `Expected answer: ${input.expectedAnswer}`,
      input.userAnswer ? `Student answer: ${input.userAnswer}` : "",
      input.feedback ? `Prior feedback: ${input.feedback}` : "",
      input.idealAnswer ? `Ideal answer: ${input.idealAnswer}` : "",
      historyText ? `Recent conversation:\n${historyText}` : "",
      `Learner message: ${input.userMessage}`
    ]
      .filter((line) => line.length > 0)
      .join("\n");

    const prompt = [
      "You are a tutoring assistant helping the learner understand one flashcard.",
      "Return ONLY JSON in this exact shape:",
      '{"assistantReply":"..."}',
      "Rules:",
      "- Keep answers concise and educational.",
      "- Do not reveal irrelevant content.",
      "",
      context
    ].join("\n");

    const raw = await callGeminiJson(input.model, prompt);
    const parsed = followUpResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError("Gemini returned invalid follow-up JSON", 502);
    }

    return parsed.data.assistantReply;
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

function toHistoryText(history: StudyChatMessage[]): string {
  if (history.length === 0) {
    return "";
  }

  return history
    .slice(-12)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");
}

function scoreAnswer(expectedAnswer: string, userAnswer: string): number {
  const expectedTokens = tokenize(expectedAnswer);
  const userTokens = tokenize(userAnswer);
  if (expectedTokens.size === 0 || userTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of expectedTokens) {
    if (userTokens.has(token)) {
      overlap += 1;
    }
  }

  const coverage = overlap / expectedTokens.size;
  return Math.max(0, Math.min(100, Math.round(coverage * 100)));
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 3)
  );
}

async function callGeminiJson(model: string, prompt: string): Promise<unknown> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY ?? "")}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    })
  });

  const raw = (await response.json()) as GeminiGenerateResponse;
  if (!response.ok) {
    throw new AppError(raw.error?.message ?? "Gemini request failed", 502);
  }

  const text = raw.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) {
    throw new AppError("Gemini returned empty content", 502);
  }

  return parseJsonWithRecovery(text);
}

function parseJsonWithRecovery(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    const firstBrace = value.indexOf("{");
    const lastBrace = value.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new AppError("Invalid JSON response from AI provider", 502);
    }
    try {
      return JSON.parse(value.slice(firstBrace, lastBrace + 1));
    } catch {
      throw new AppError("Invalid JSON response from AI provider", 502);
    }
  }
}

export function getStudyAiProvider(): StudyAiProvider {
  if (env.AI_INGEST_PROVIDER === "mock") {
    return new MockStudyAiProvider();
  }
  return new GeminiStudyAiProvider();
}
