-- SQLite requires a constant default when a NOT NULL column is added.
-- Rebuild the table after backfilling so it matches Prisma's @updatedAt definition.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Assembly" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "showLiveResults" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Assembly" ("createdAt", "description", "endTime", "id", "showLiveResults", "startTime", "status", "title", "updatedAt")
SELECT "createdAt", "description", "endTime", "id", "showLiveResults", "startTime", "status", "title", "updatedAt" FROM "Assembly";
DROP TABLE "Assembly";
ALTER TABLE "new_Assembly" RENAME TO "Assembly";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
