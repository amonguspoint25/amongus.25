import "dotenv/config";
import { prisma } from "../src/lib/db";
import { processMatch } from "../src/lib/ingest/processMatch";

const NAMES = ["Red","Blue","Green","Lime","Cyan","Rose","Black","White","Purple","Orange","Yellow","Pink"];
const rnd = (n: number) => Math.floor(Math.random() * n);

async function main() {
  await prisma.matchParticipant.deleteMany();
  await prisma.match.deleteMany();
  await prisma.player.deleteMany();
  await prisma.user.deleteMany();

  for (const n of NAMES) {
    const u = await prisma.user.create({ data: { discordId: "demo-" + n, username: n } });
    await prisma.player.create({ data: { userId: u.id, displayName: n, linkCode: n + "-LINK", isLinked: true } });
  }

  for (let m = 0; m < 40; m++) {
    const shuffled = [...NAMES].sort(() => Math.random() - 0.5).slice(0, 8);
    const imps = shuffled.slice(0, 2);
    const crew = shuffled.slice(2);
    const impWin = Math.random() < 0.45;
    const now = new Date();
    const started = new Date(now.getTime() - 12 * 60000).toISOString();
    const ended = now.toISOString();
    await processMatch({
      matchCode: "SEED" + m, map: "Skeld", startedAt: started, endedAt: ended,
      outcome: impWin ? "IMP_WIN" : "CREW_WIN",
      participants: [
        ...imps.map((d) => ({ discordId: "demo-" + d, role: "IMPOSTOR" as const, won: impWin,
          kills: rnd(4), correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0,
          timeToKillMs: 8000 + rnd(25000), survived: Math.random() < 0.5 })),
        ...crew.map((d) => ({ discordId: "demo-" + d, role: "CREW" as const, won: !impWin,
          kills: 0, correctShots: rnd(3), incorrectShots: rnd(2), tasksDone: rnd(6), tasksTotal: 5,
          timeToTaskMs: 40000 + rnd(80000), survived: Math.random() < 0.6 })),
      ],
    });
  }
  console.log("seeded: 12 players, 40 matches");
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
