-- AlterTable
ALTER TABLE "Player" ALTER COLUMN "linkCode" DROP NOT NULL;
ALTER TABLE "Player" ADD COLUMN     "linkCodeExpiresAt" TIMESTAMP(3);

-- Invalidate every pre-existing standing link code. On-demand generation replaces them;
-- existing players click "Generate" once to re-link. This is the point of the feature.
UPDATE "Player" SET "linkCode" = NULL;
