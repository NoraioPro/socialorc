-- AlterTable
ALTER TABLE "SocialAccount" ADD COLUMN     "brainId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "coverImageUrl" TEXT,
ADD COLUMN     "headline" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "Brain" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedReaction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'LIKE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandBrain" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandBrain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Brain_userId_idx" ON "Brain"("userId");

-- CreateIndex
CREATE INDEX "FeedReaction_postId_idx" ON "FeedReaction"("postId");

-- CreateIndex
CREATE INDEX "FeedReaction_userId_idx" ON "FeedReaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedReaction_postId_userId_key" ON "FeedReaction"("postId", "userId");

-- CreateIndex
CREATE INDEX "FeedComment_postId_idx" ON "FeedComment"("postId");

-- CreateIndex
CREATE INDEX "FeedComment_userId_idx" ON "FeedComment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandBrain_userId_key" ON "BrandBrain"("userId");

-- CreateIndex
CREATE INDEX "SocialAccount_brainId_idx" ON "SocialAccount"("brainId");

-- AddForeignKey
ALTER TABLE "Brain" ADD CONSTRAINT "Brain_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_brainId_fkey" FOREIGN KEY ("brainId") REFERENCES "Brain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedReaction" ADD CONSTRAINT "FeedReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedReaction" ADD CONSTRAINT "FeedReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandBrain" ADD CONSTRAINT "BrandBrain_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

