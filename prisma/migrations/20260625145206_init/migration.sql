-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('FIND_PARTNER', 'COURT');

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('Y', 'TBY', 'TB', 'TBK', 'K', 'T', 'ANY');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('OPEN', 'FILLED', 'CLOSED');

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "type" "PostType" NOT NULL,
    "title" TEXT NOT NULL,
    "area" TEXT,
    "location" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "skillLevel" "SkillLevel" NOT NULL DEFAULT 'ANY',
    "playersNeeded" INTEGER NOT NULL DEFAULT 1,
    "playersCurrent" INTEGER NOT NULL DEFAULT 0,
    "pricePerHour" INTEGER,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "notes" TEXT,
    "sourceUrl" TEXT,
    "status" "PostStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);
