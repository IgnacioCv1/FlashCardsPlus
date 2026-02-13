-- CreateTable
CREATE TABLE "MonthlyUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "documentGenerations" INTEGER NOT NULL DEFAULT 0,
    "chatTurns" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MonthlyUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "name" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "updatedAt") SELECT "createdAt", "email", "id", "name", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MonthlyUsage_monthKey_idx" ON "MonthlyUsage"("monthKey");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyUsage_userId_monthKey_key" ON "MonthlyUsage"("userId", "monthKey");
