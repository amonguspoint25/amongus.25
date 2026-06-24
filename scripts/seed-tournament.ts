import "dotenv/config";
import { prisma } from "../src/lib/db";
import { createTournament } from "../src/lib/tournament/create";

async function main() {
  await prisma.bracketMatch.deleteMany();
  await prisma.tournament.deleteMany();
  const players = await prisma.player.findMany({ take: 8, orderBy: { overallElo: "desc" } });
  if (players.length < 4) { console.log("need >=4 players; run `npm run seed` first"); return; }
  const ids = players.slice(0, 8).map((p) => p.id);
  const t = await createTournament({ name: "Sus Open #1", slug: "sus-open-1", playerIds: ids });
  console.log("seeded tournament:", t.slug, "with", ids.length, "players");
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
