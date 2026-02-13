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
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30)
});

export const env = envSchema.parse(process.env);
