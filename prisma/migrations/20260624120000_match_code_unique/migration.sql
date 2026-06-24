-- AlterTable: add unique constraint on Match.code for idempotency / replay protection
CREATE UNIQUE INDEX "Match_code_key" ON "Match"("code");
