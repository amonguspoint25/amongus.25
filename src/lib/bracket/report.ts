// Operates on a PERSISTED BracketMatch row (Task 11), whose next-match pointer is the
// real DB id `winnerNextMatchId`. This is distinct from SeedMatch.winnerNextLocalId, the
// pre-insert placeholder used only during generateSingleElim(); the two are resolved into
// real ids at insert time. Do not pass a SeedMatch here.
export function applyResult(node: { winnerNextMatchId?: string | null; winnerNextSlot?: string | null }, winnerId: string) {
  return { winnerId, nextMatchId: node.winnerNextMatchId ?? undefined, nextSlot: node.winnerNextSlot ?? undefined };
}
