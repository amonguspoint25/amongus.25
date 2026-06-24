// Players start at 1000, so Bronze (min 0) is the true entry tier and the ladder
// climbs from there. Each threshold is a meaningful gap above the 1000 start.
export const TIERS = [
  { name: "Bronze", min: 0, image: "/media/tier-bronze.png", glow: "#cd7f32" },
  { name: "Silver", min: 1050, image: "/media/tier-silver.png", glow: "#c8d0dc" },
  { name: "Gold", min: 1150, image: "/media/tier-gold.png", glow: "#ffcf52" },
  { name: "Platinum", min: 1250, image: "/media/tier-platinum.png", glow: "#bfe3ff" },
  { name: "Diamond", min: 1350, image: "/media/tier-diamond.png", glow: "#38e1ff" },
  { name: "Top Impostor", min: 1500, image: "/media/tier-top-impostor.png", glow: "#ff4d5e" },
];
export function tierFor(elo: number) {
  return [...TIERS].reverse().find((t) => elo >= t.min) ?? TIERS[0];
}
