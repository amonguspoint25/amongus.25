export function applyResult(node: { winnerNextMatchId?: string | null; winnerNextSlot?: string | null }, winnerId: string) {
  return { winnerId, nextMatchId: node.winnerNextMatchId ?? undefined, nextSlot: node.winnerNextSlot ?? undefined };
}
