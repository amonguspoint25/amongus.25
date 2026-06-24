import { LeaderboardTable } from "@/components/LeaderboardTable";

export const metadata = { title: "Leaderboard — Among Us .25 Ranked" };

export default function Page() {
  return (
    <main className="max-w-4xl mx-auto p-8">
      <p className="eyebrow mb-1">// CREW MANIFEST</p>
      <h1 className="text-3xl font-extrabold mb-6">Rankings</h1>
      <LeaderboardTable />
    </main>
  );
}
