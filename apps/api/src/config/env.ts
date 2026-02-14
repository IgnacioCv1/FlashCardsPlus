import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().url().default("http://localhost:3000"),
  ENCRYPTION_KEY: z.string().min(32),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  WEB_AUTH_SUCCESS_REDIRECT: z.string().url().default("http://localhost:3000/auth/callback"),
  WEB_AUTH_FAILURE_REDIRECT: z.string().url().default("http://localhost:3000/login"),
  INGEST_DRAFT_CLEANUP_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  AI_INGEST_PROVIDER: z.enum(["gemini", "mock"]).default("gemini"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  DEV_UNLIMITED_TESTER_EMAILS: z.string().default("")
});

export const env = envSchema.parse(process.env);
