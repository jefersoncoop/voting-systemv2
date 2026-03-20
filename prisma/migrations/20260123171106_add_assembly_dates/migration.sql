/*
  Warnings:

  - You are about to drop the column `status` on the `AgendaItem` table. All the data in the column will be lost.
  - Added the required column `assemblyId` to the `AgendaItem` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Assembly" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AgendaItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "assemblyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgendaItem_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AgendaItem" ("createdAt", "description", "id", "title") SELECT "createdAt", "description", "id", "title" FROM "AgendaItem";
DROP TABLE "AgendaItem";
ALTER TABLE "new_AgendaItem" RENAME TO "AgendaItem";
CREATE TABLE "new_Vote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "choice" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userId" TEXT NOT NULL,
    "agendaItemId" TEXT NOT NULL,
    CONSTRAINT "Vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Vote_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "AgendaItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Vote" ("agendaItemId", "choice", "id", "ipAddress", "timestamp", "userId") SELECT "agendaItemId", "choice", "id", "ipAddress", "timestamp", "userId" FROM "Vote";
DROP TABLE "Vote";
ALTER TABLE "new_Vote" RENAME TO "Vote";
CREATE UNIQUE INDEX "Vote_userId_agendaItemId_key" ON "Vote"("userId", "agendaItemId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
