export type SeedMatch = {
  localId: string; round: number; slotInRound: number;
  playerAId?: string; playerBId?: string;
  winnerNextLocalId?: string; winnerNextSlot?: "TOP" | "BOTTOM";
};
export function generateSingleElim(playerIds: string[]): SeedMatch[] {
  const n = nextPow2(playerIds.length);
  const rounds = Math.log2(n);
  const matches: SeedMatch[] = [];
  for (let r = 1; r <= rounds; r++) {
    const count = n / Math.pow(2, r);
    for (let s = 0; s < count; s++) matches.push({ localId: `r${r}m${s}`, round: r, slotInRound: s });
  }
  const r1 = matches.filter((m) => m.round === 1); // length n/2
  const byes = n - playerIds.length;               // trailing single-player (bye) matches
  const fullMatches = r1.length - byes;
  let p = 0;
  for (let i = 0; i < r1.length; i++) {
    if (i < fullMatches) {
      r1[i].playerAId = playerIds[p++];
      r1[i].playerBId = playerIds[p++];
    } else {
      r1[i].playerAId = playerIds[p++];
      r1[i].playerBId = undefined; // bye
    }
  }
  for (let r = 1; r < rounds; r++) {
    const cur = matches.filter((m) => m.round === r);
    for (let s = 0; s < cur.length; s++) {
      cur[s].winnerNextLocalId = `r${r + 1}m${Math.floor(s / 2)}`;
      cur[s].winnerNextSlot = s % 2 === 0 ? "TOP" : "BOTTOM";
    }
  }
  return matches;
}
function nextPow2(x: number): number { let p = 1; while (p < x) p *= 2; return Math.max(2, p); }
