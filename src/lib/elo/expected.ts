export function expectedScore(rating: number, opponentAvg: number): number {
  return 1 / (1 + Math.pow(10, (opponentAvg - rating) / 400));
}
