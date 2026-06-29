-- Voiding support: flag a match as void (excluded from ratings, which are rebuilt by a recompute),
-- and persist `disconnected` on participants so the recompute can faithfully reproduce the
-- DC-nullify behaviour (rating untouched + excluded from opponent averages).
ALTER TABLE "Match" ADD COLUMN "voided" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Match" ADD COLUMN "voidedAt" TIMESTAMP(3);
ALTER TABLE "MatchParticipant" ADD COLUMN "disconnected" BOOLEAN NOT NULL DEFAULT false;
