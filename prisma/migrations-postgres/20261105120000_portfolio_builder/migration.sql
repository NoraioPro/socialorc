-- Portfolio builder (artifact version).
--
-- Replaces the earlier builder's tables (migration 20261103120000_portfolio,
-- Postgres only). Any rows in them are dropped: the new builder stores its
-- documents differently and starts fresh.
DROP TABLE IF EXISTS "PortfolioPinnedMedia" CASCADE;
DROP TABLE IF EXISTS "PortfolioBlobTask" CASCADE;
DROP TABLE IF EXISTS "PortfolioTemplate" CASCADE;
ALTER TABLE IF EXISTS "Portfolio" DROP CONSTRAINT IF EXISTS "Portfolio_publishedRevisionId_id_fkey";
DROP TABLE IF EXISTS "PortfolioRevision" CASCADE;
DROP TABLE IF EXISTS "Portfolio" CASCADE;
DROP TYPE IF EXISTS "PortfolioStatus";

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "draftDoc" TEXT NOT NULL,
    "draftRevision" INTEGER NOT NULL DEFAULT 0,
    "publishedVersionId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "searchIndexing" BOOLEAN NOT NULL DEFAULT true,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioVersion" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "doc" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioRedirect" (
    "oldHandle" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioRedirect_pkey" PRIMARY KEY ("oldHandle")
);

-- CreateTable
CREATE TABLE "PortfolioTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "doc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Portfolio_userId_key" ON "Portfolio"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Portfolio_handle_key" ON "Portfolio"("handle");

-- CreateIndex
CREATE INDEX "PortfolioVersion_portfolioId_createdAt_idx" ON "PortfolioVersion"("portfolioId", "createdAt");

-- CreateIndex
CREATE INDEX "PortfolioTemplate_userId_idx" ON "PortfolioTemplate"("userId");

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioVersion" ADD CONSTRAINT "PortfolioVersion_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioRedirect" ADD CONSTRAINT "PortfolioRedirect_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioTemplate" ADD CONSTRAINT "PortfolioTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
