-- Normalize the legacy assembly state.
UPDATE "Assembly" SET "status" = 'SCHEDULED' WHERE "status" = 'PENDING';

-- Add assembly publication and lifecycle metadata.
ALTER TABLE "Assembly" ADD COLUMN "showLiveResults" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Assembly" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00';
UPDATE "Assembly" SET "updatedAt" = CURRENT_TIMESTAMP;

-- Session registry for revocation and role refresh.
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- One-time, expiring 2FA challenges.
CREATE TABLE "TwoFactorChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    CONSTRAINT "TwoFactorChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TwoFactorChallenge_userId_createdAt_idx" ON "TwoFactorChallenge"("userId", "createdAt");
CREATE INDEX "TwoFactorChallenge_expiresAt_idx" ON "TwoFactorChallenge"("expiresAt");

-- One stable receipt/protocol per voter and assembly.
CREATE TABLE "Participation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "protocol" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assemblyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Participation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Participation_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Participation_protocol_key" ON "Participation"("protocol");
CREATE UNIQUE INDEX "Participation_userId_assemblyId_key" ON "Participation"("userId", "assemblyId");
CREATE INDEX "Participation_assemblyId_idx" ON "Participation"("assemblyId");

INSERT INTO "Participation" ("id", "protocol", "userId", "assemblyId", "createdAt")
SELECT lower(hex(randomblob(16))),
       COALESCE(MIN(v."protocol"), upper(substr(hex(randomblob(16)), 1, 4) || '-' || substr(hex(randomblob(16)), 1, 4) || '-' || substr(hex(randomblob(16)), 1, 4) || '-' || substr(hex(randomblob(16)), 1, 4))),
       v."userId", a."assemblyId", MIN(v."timestamp")
FROM "Vote" v
JOIN "AgendaItem" a ON a."id" = v."agendaItemId"
GROUP BY v."userId", a."assemblyId";

-- Append-only operational audit trail.
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "actorUserId" TEXT,
    "assemblyId" TEXT,
    "targetId" TEXT,
    "metadata" TEXT,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditEvent_type_createdAt_idx" ON "AuditEvent"("type", "createdAt");
CREATE INDEX "AuditEvent_assemblyId_createdAt_idx" ON "AuditEvent"("assemblyId", "createdAt");
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");

-- Persistent rate-limit buckets suitable for a single database deployment.
CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" DATETIME NOT NULL,
    "blockedUntil" DATETIME,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "RateLimitBucket_action_keyHash_key" ON "RateLimitBucket"("action", "keyHash");
CREATE INDEX "RateLimitBucket_blockedUntil_idx" ON "RateLimitBucket"("blockedUntil");

-- Votes must prevent deletion through related entities once recorded.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Vote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "choice" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "deviceHash" TEXT,
    "protocol" TEXT,
    "userId" TEXT NOT NULL,
    "agendaItemId" TEXT NOT NULL,
    CONSTRAINT "Vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Vote_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "AgendaItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Vote" ("agendaItemId", "choice", "deviceHash", "id", "ipAddress", "protocol", "timestamp", "userId")
SELECT "agendaItemId", "choice", "deviceHash", "id", "ipAddress", "protocol", "timestamp", "userId" FROM "Vote";
DROP TABLE "Vote";
ALTER TABLE "new_Vote" RENAME TO "Vote";
CREATE UNIQUE INDEX "Vote_userId_agendaItemId_key" ON "Vote"("userId", "agendaItemId");
CREATE INDEX "Vote_agendaItemId_idx" ON "Vote"("agendaItemId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
