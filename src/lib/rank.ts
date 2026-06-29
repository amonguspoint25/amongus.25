// Players start at 1000 (Bronze). The ladder climbs from there; Iron and Wood sit BELOW
// the start for players who keep losing and drop under the 1000 baseline.
export const TIERS = [
  { name: "Wood", min: 0, image: "/media/tier-wood.png", glow: "#c8924a" },
  { name: "Iron", min: 850, image: "/media/tier-iron.png", glow: "#b4c0cf" },
  { name: "Bronze", min: 950, image: "/media/tier-bronze.png", glow: "#cd7f32" },
  { name: "Silver", min: 1050, image: "/media/tier-silver.png", glow: "#c8d0dc" },
  { name: "Gold", min: 1150, image: "/media/tier-gold.png", glow: "#ffcf52" },
  { name: "Platinum", min: 1280, image: "/media/tier-platinum.png", glow: "#bfe3ff" },
  { name: "Diamond", min: 1420, image: "/media/tier-diamond.png", glow: "#38e1ff" },
  { name: "Top Impostor", min: 1600, image: "/media/tier-top-impostor.png", glow: "#ff4d5e" },
];
export function tierFor(elo: number) {
  return [...TIERS].reverse().find((t) => elo >= t.min) ?? TIERS[0];
}
