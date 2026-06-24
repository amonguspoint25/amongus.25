export const TIERS = [
  { name: "Bronze", min: 0, image: "/media/tier-bronze.png" },
  { name: "Silver", min: 950, image: "/media/tier-silver.png" },
  { name: "Gold", min: 1050, image: "/media/tier-gold.png" },
  { name: "Platinum", min: 1150, image: "/media/tier-platinum.png" },
  { name: "Diamond", min: 1250, image: "/media/tier-diamond.png" },
  { name: "Top Impostor", min: 1350, image: "/media/tier-top-impostor.png" },
];
export function tierFor(elo: number) {
  return [...TIERS].reverse().find((t) => elo >= t.min) ?? TIERS[0];
}
