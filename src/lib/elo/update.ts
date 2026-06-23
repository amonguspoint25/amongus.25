import { expectedScore } from "./expected";
export function updateRating(args: {
  rating: number; opponentAvg: number; won: boolean; perf: number; k?: number; b?: number;
}): { eloAfter: number; eloDelta: number } {
  const { rating, opponentAvg, won, perf, k = 32, b = 10 } = args;
  const expected = expectedScore(rating, opponentAvg);
  const core = k * ((won ? 1 : 0) - expected);
  const bonus = b * Math.max(-1, Math.min(1, perf));
  const eloDelta = core + bonus;
  return { eloAfter: rating + eloDelta, eloDelta };
}
