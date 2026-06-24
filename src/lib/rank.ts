export const TIERS = [
  { name: "Bronze", min: 0 },
  { name: "Silver", min: 950 },
  { name: "Gold", min: 1050 },
  { name: "Platinum", min: 1150 },
  { name: "Diamond", min: 1250 },
  { name: "Top Impostor", min: 1350 },
];
export function tierFor(elo: number) {
  return [...TIERS].reverse().find((t) => elo >= t.min) ?? TIERS[0];
}
