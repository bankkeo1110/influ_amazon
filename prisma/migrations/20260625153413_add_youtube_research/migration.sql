-- CreateTable
CREATE TABLE "ProductSearch" (
    "id" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YoutubeVideo" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "channelTitle" TEXT NOT NULL,
    "publishedAt" TEXT NOT NULL,
    "viewCount" TEXT,
    "hasAffiliate" BOOLEAN NOT NULL DEFAULT false,
    "productSearchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YoutubeVideo_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "YoutubeVideo" ADD CONSTRAINT "YoutubeVideo_productSearchId_fkey" FOREIGN KEY ("productSearchId") REFERENCES "ProductSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
