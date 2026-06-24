import { isProvisional, PLACEMENT_GAMES } from "./elo/placement";

export type LeaderboardSort = "overall" | "crew" | "imp";

export type PlayerRow = {
  id: string;
  name: string;
  crewElo: number;
  impElo: number;
  overallElo: number;
  games: number;
  crewGames: number;
  impGames: number;
};

export type LeaderboardRow = {
  id: string;
  name: string;
  crewElo: number;
  impElo: number;
  overallElo: number;
  games: number;
  gamesInRole: number;
  needed: number;
};

export function gamesInRoleFor(row: PlayerRow, sort: LeaderboardSort): number {
  if (sort === "crew") return row.crewGames;
  if (sort === "imp") return row.impGames;
  return row.games;
}

export function eloForSort(
  row: { crewElo: number; impElo: number; overallElo: number },
  sort: LeaderboardSort,
): number {
  if (sort === "crew") return row.crewElo;
  if (sort === "imp") return row.impElo;
  return row.overallElo;
}

function toRow(row: PlayerRow, sort: LeaderboardSort): LeaderboardRow {
  return {
    id: row.id,
    name: row.name,
    crewElo: row.crewElo,
    impElo: row.impElo,
    overallElo: row.overallElo,
    games: row.games,
    gamesInRole: gamesInRoleFor(row, sort),
    needed: PLACEMENT_GAMES,
  };
}

// `rows` is assumed already sorted by the active field (ELO desc). Ranked rows keep
// that order; provisional rows are re-sorted so the players closest to qualifying
// (most games in the role) come first, tie-broken by the active ELO.
export function partitionProvisional(
  rows: PlayerRow[],
  sort: LeaderboardSort,
): { ranked: LeaderboardRow[]; provisional: LeaderboardRow[] } {
  const ranked: LeaderboardRow[] = [];
  const provisional: LeaderboardRow[] = [];
  for (const r of rows) {
    (isProvisional(gamesInRoleFor(r, sort)) ? provisional : ranked).push(toRow(r, sort));
  }
  provisional.sort(
    (a, b) =>
      b.gamesInRole - a.gamesInRole ||
      eloForSort(b, sort) - eloForSort(a, sort),
  );
  return { ranked, provisional };
}
