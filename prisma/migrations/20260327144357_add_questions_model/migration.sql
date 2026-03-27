-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "voterCpf" TEXT NOT NULL,
    "voterName" TEXT NOT NULL,
    "voterMunicipality" TEXT NOT NULL,
    "assemblyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Question_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
