-- CreateTable
CREATE TABLE "BrandBrain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "brandName" TEXT,
    "industry" TEXT,
    "description" TEXT,
    "targetAudience" TEXT,
    "uniqueValue" TEXT,
    "tone" TEXT,
    "personality" TEXT,
    "writingStyle" TEXT,
    "avoidTopics" TEXT,
    "keyPhrases" TEXT,
    "primaryGoal" TEXT,
    "contentPillars" TEXT,
    "callToAction" TEXT,
    "hashtagStrategy" TEXT,
    "platformOverrides" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandBrain_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandBrain_userId_key" ON "BrandBrain"("userId");
