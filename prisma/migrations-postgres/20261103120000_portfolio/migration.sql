-- Professional Portfolio (full visual builder) — initial schema.
-- The document tree is jsonb; ownership, handles, status and the published
-- pointer are relational so the database can enforce them.

-- CreateEnum
CREATE TYPE "PortfolioStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable: a product flag (may this asset appear in a public portfolio).
-- It is NOT Blob access control: uploads are public objects.
ALTER TABLE "MediaAsset" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PUBLIC';

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "status" "PortfolioStatus" NOT NULL DEFAULT 'DRAFT',
    "draftDocument" JSONB NOT NULL,
    "documentVersion" INTEGER NOT NULL DEFAULT 1,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "publishedRevisionId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "templateKey" TEXT,
    "templateVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioRevision" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "label" TEXT,
    "ogImageSha" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "PortfolioRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioPinnedMedia" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER NOT NULL,
    "sourceMediaAssetId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'INLINE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioPinnedMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioBlobTask" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioBlobTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "documentHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Portfolio_userId_key" ON "Portfolio"("userId");
CREATE UNIQUE INDEX "Portfolio_handle_key" ON "Portfolio"("handle");
CREATE UNIQUE INDEX "Portfolio_publishedRevisionId_key" ON "Portfolio"("publishedRevisionId");
CREATE UNIQUE INDEX "Portfolio_publishedRevisionId_id_key" ON "Portfolio"("publishedRevisionId", "id");
CREATE INDEX "Portfolio_status_idx" ON "Portfolio"("status");

CREATE UNIQUE INDEX "PortfolioRevision_id_portfolioId_key" ON "PortfolioRevision"("id", "portfolioId");
CREATE UNIQUE INDEX "PortfolioRevision_portfolioId_hash_key" ON "PortfolioRevision"("portfolioId", "hash");
CREATE INDEX "PortfolioRevision_portfolioId_createdAt_idx" ON "PortfolioRevision"("portfolioId", "createdAt");

CREATE UNIQUE INDEX "PortfolioPinnedMedia_pathname_key" ON "PortfolioPinnedMedia"("pathname");
CREATE UNIQUE INDEX "PortfolioPinnedMedia_revisionId_sha256_key" ON "PortfolioPinnedMedia"("revisionId", "sha256");
CREATE INDEX "PortfolioPinnedMedia_portfolioId_idx" ON "PortfolioPinnedMedia"("portfolioId");

CREATE INDEX "PortfolioBlobTask_state_nextAttemptAt_idx" ON "PortfolioBlobTask"("state", "nextAttemptAt");
CREATE INDEX "PortfolioBlobTask_pathname_idx" ON "PortfolioBlobTask"("pathname");

CREATE UNIQUE INDEX "PortfolioTemplate_key_key" ON "PortfolioTemplate"("key");

-- AddForeignKey: ownership
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PortfolioRevision" ADD CONSTRAINT "PortfolioRevision_portfolioId_fkey"
    FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: the composite pointer. Added after both tables exist because
-- Portfolio <-> PortfolioRevision is circular. It is what makes "a portfolio may
-- only publish its own revision" a database invariant.
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_publishedRevisionId_id_fkey"
    FOREIGN KEY ("publishedRevisionId", "id") REFERENCES "PortfolioRevision"("id", "portfolioId")
    ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey: a pin row cannot mix a portfolio with another portfolio's revision.
ALTER TABLE "PortfolioPinnedMedia" ADD CONSTRAINT "PortfolioPinnedMedia_revisionId_portfolioId_fkey"
    FOREIGN KEY ("revisionId", "portfolioId") REFERENCES "PortfolioRevision"("id", "portfolioId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PortfolioPinnedMedia" ADD CONSTRAINT "PortfolioPinnedMedia_portfolioId_fkey"
    FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PortfolioPinnedMedia" ADD CONSTRAINT "PortfolioPinnedMedia_sourceMediaAssetId_fkey"
    FOREIGN KEY ("sourceMediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
