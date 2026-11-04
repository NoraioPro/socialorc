-- Portfolio builder (artifact version).
--
-- SQLite never received the earlier builder's migration (it was Postgres only),
-- so there is nothing to drop here; MediaAsset.visibility, which the schema
-- already declares, is added so the two databases match.
ALTER TABLE "MediaAsset" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PUBLIC';

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "draftDoc" TEXT NOT NULL,
    "draftRevision" INTEGER NOT NULL DEFAULT 0,
    "publishedVersionId" TEXT,
    "publishedAt" DATETIME,
    "searchIndexing" BOOLEAN NOT NULL DEFAULT true,
    "templateId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Portfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortfolioVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolioId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "doc" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortfolioVersion_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortfolioRedirect" (
    "oldHandle" TEXT NOT NULL PRIMARY KEY,
    "portfolioId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "PortfolioRedirect_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortfolioTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "doc" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortfolioTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Portfolio_userId_key" ON "Portfolio"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Portfolio_handle_key" ON "Portfolio"("handle");

-- CreateIndex
CREATE INDEX "PortfolioVersion_portfolioId_createdAt_idx" ON "PortfolioVersion"("portfolioId", "createdAt");

-- CreateIndex
CREATE INDEX "PortfolioTemplate_userId_idx" ON "PortfolioTemplate"("userId");
