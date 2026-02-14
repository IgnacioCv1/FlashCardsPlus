import { env } from "./config/env.js";
import { startIngestionDraftCleanupScheduler } from "./ingest/draft-cleanup.js";
import { createApp } from "./app.js";

const app = createApp();

startIngestionDraftCleanupScheduler(env.INGEST_DRAFT_CLEANUP_INTERVAL_MINUTES * 60_000);

app.listen(env.API_PORT, () => {
  console.log(`API listening on http://localhost:${env.API_PORT}`);
});
