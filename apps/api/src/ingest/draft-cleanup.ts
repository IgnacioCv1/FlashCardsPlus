import { prisma } from "../lib/prisma.js";

export async function deleteExpiredIngestionDrafts(now = new Date()): Promise<number> {
  const result = await prisma.ingestionDraft.deleteMany({
    where: {
      expiresAt: {
        lte: now
      }
    }
  });

  return result.count;
}

export function startIngestionDraftCleanupScheduler(intervalMs: number): () => void {
  const runCleanup = async () => {
    try {
      const deleted = await deleteExpiredIngestionDrafts();
      if (deleted > 0) {
        console.log(`[ingest-cleanup] deleted ${deleted} expired draft(s)`);
      }
    } catch (error) {
      console.error("[ingest-cleanup] failed to delete expired drafts", error);
    }
  };

  void runCleanup();

  const timer = setInterval(() => {
    void runCleanup();
  }, intervalMs);

  timer.unref();

  return () => {
    clearInterval(timer);
  };
}
