-- CreateEnum
CREATE TYPE "ContactTopic" AS ENUM ('DEMO', 'PRICING', 'SUPPORT', 'PARTNERSHIP', 'OTHER');

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "organization" TEXT,
    "topic" "ContactTopic" NOT NULL DEFAULT 'OTHER',
    "message" TEXT NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactMessage_createdAt_idx" ON "ContactMessage"("createdAt");
