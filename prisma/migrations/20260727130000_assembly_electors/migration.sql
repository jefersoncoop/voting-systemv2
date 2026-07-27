CREATE TABLE "AssemblyElector" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assemblyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssemblyElector_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssemblyElector_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AssemblyElector_assemblyId_userId_key" ON "AssemblyElector"("assemblyId", "userId");
CREATE INDEX "AssemblyElector_userId_assemblyId_idx" ON "AssemblyElector"("userId", "assemblyId");

-- Preserve the legacy behavior: every existing non-admin voter was implicitly
-- eligible for every existing assembly before this relation existed.
INSERT INTO "AssemblyElector" ("id", "assemblyId", "userId", "createdAt")
SELECT lower(hex(randomblob(16))), a."id", u."id", CURRENT_TIMESTAMP
FROM "Assembly" a
CROSS JOIN "User" u
WHERE u."isAdmin" = false;
