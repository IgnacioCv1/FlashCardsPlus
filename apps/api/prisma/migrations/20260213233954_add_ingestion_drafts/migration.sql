-- CreateTable
CREATE TABLE "IngestionDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "committedAt" DATETIME,
    CONSTRAINT "IngestionDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IngestionDraft_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IngestionDraftCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IngestionDraftCard_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "IngestionDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "IngestionDraft_userId_status_idx" ON "IngestionDraft"("userId", "status");

-- CreateIndex
CREATE INDEX "IngestionDraft_deckId_status_idx" ON "IngestionDraft"("deckId", "status");

-- CreateIndex
CREATE INDEX "IngestionDraft_expiresAt_idx" ON "IngestionDraft"("expiresAt");

-- CreateIndex
CREATE INDEX "IngestionDraftCard_draftId_position_idx" ON "IngestionDraftCard"("draftId", "position");
