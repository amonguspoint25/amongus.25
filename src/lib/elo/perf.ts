export type PerfStats = {
  kills: number; correctShots: number; incorrectShots: number;
  tasksDone: number; tasksTotal: number;
  timeToKillMs?: number; timeToTaskMs?: number; survived: boolean;
};

const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));

/**
 * computePerf — OWNER CONTRIBUTION POINT.
 * Returns a normalized performance score in [-1, 1] for the player's role.
 * Tune the weights below to shape how much each stat matters.
 */
export function computePerf(role: "CREW" | "IMPOSTOR", s: PerfStats): number {
  if (role === "IMPOSTOR") {
    const killScore = s.kills * 0.25;                       // each kill helps
    const speed = s.timeToKillMs ? clamp((30000 - s.timeToKillMs) / 30000) * 0.3 : 0;
    const survival = s.survived ? 0.15 : -0.15;
    return clamp(killScore + speed + survival);
  }
  const taskPct = s.tasksTotal ? s.tasksDone / s.tasksTotal : 0;
  const taskScore = taskPct * 0.4;
  const shots = s.correctShots * 0.2 - s.incorrectShots * 0.25;
  const speed = s.timeToTaskMs ? clamp((120000 - s.timeToTaskMs) / 120000) * 0.2 : 0;
  const survival = s.survived ? 0.1 : -0.1;
  return clamp(taskScore + shots + speed + survival);
}
