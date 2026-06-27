-- DropForeignKey
ALTER TABLE "HostKey" DROP CONSTRAINT "HostKey_hostUserId_fkey";

-- AddForeignKey
ALTER TABLE "HostKey" ADD CONSTRAINT "HostKey_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
