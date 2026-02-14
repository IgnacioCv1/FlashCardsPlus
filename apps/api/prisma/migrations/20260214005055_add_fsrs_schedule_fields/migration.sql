-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ScheduleState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "dueAt" DATETIME NOT NULL,
    "lastReviewedAt" DATETIME,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "easeFactor" REAL NOT NULL DEFAULT 2.5,
    "fsrsState" INTEGER NOT NULL DEFAULT 0,
    "fsrsStability" REAL NOT NULL DEFAULT 0,
    "fsrsDifficulty" REAL NOT NULL DEFAULT 0,
    "fsrsElapsedDays" INTEGER NOT NULL DEFAULT 0,
    "fsrsScheduledDays" INTEGER NOT NULL DEFAULT 0,
    "fsrsLearningSteps" INTEGER NOT NULL DEFAULT 0,
    "fsrsLapses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduleState_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ScheduleState" ("cardId", "createdAt", "dueAt", "easeFactor", "id", "intervalMinutes", "lastReviewedAt", "repetitions", "updatedAt") SELECT "cardId", "createdAt", "dueAt", "easeFactor", "id", "intervalMinutes", "lastReviewedAt", "repetitions", "updatedAt" FROM "ScheduleState";
DROP TABLE "ScheduleState";
ALTER TABLE "new_ScheduleState" RENAME TO "ScheduleState";
CREATE UNIQUE INDEX "ScheduleState_cardId_key" ON "ScheduleState"("cardId");
CREATE INDEX "ScheduleState_dueAt_idx" ON "ScheduleState"("dueAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
