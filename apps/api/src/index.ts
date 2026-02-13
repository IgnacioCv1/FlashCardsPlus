import express, { type Request, type Response } from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";

const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN
  })
);
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.use(errorHandler);

app.listen(env.API_PORT, () => {
  console.log(`API listening on http://localhost:${env.API_PORT}`);
});
