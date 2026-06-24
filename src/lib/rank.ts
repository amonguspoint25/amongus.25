// Players start at 1000, so Bronze (min 0) is the true entry tier and the ladder
// climbs from there. Each threshold is a meaningful gap above the 1000 start.
export const TIERS = [
  { name: "Bronze", min: 0, image: "/media/tier-bronze.png" },
  { name: "Silver", min: 1050, image: "/media/tier-silver.png" },
  { name: "Gold", min: 1150, image: "/media/tier-gold.png" },
  { name: "Platinum", min: 1250, image: "/media/tier-platinum.png" },
  { name: "Diamond", min: 1350, image: "/media/tier-diamond.png" },
  { name: "Top Impostor", min: 1500, image: "/media/tier-top-impostor.png" },
];
export function tierFor(elo: number) {
  return [...TIERS].reverse().find((t) => elo >= t.min) ?? TIERS[0];
}
