import { z } from "zod";

export const participantSchema = z.object({
  playerId: z.string(),
  role: z.enum(["CREW", "IMPOSTOR"]),
  won: z.boolean(),
  kills: z.number().int().min(0).default(0),
  correctShots: z.number().int().min(0).default(0),
  incorrectShots: z.number().int().min(0).default(0),
  tasksDone: z.number().int().min(0).default(0),
  tasksTotal: z.number().int().min(0).default(0),
  timeToKillMs: z.number().int().min(0).optional(),
  timeToTaskMs: z.number().int().min(0).optional(),
  survived: z.boolean().default(true),
  roundsSurvived: z.number().int().min(0).optional(),
  // Player disconnected before the game ended: still recorded, but their ELO is nullified
  // (no gain/loss) and they don't affect anyone else's rating change. Optional (not .default) so
  // it stays optional in the inferred type; processMatch treats undefined as false.
  disconnected: z.boolean().optional(),
});

export const matchPayloadSchema = z
  .object({
    matchCode: z.string(),
    map: z.string().optional(),
    startedAt: z.string(),
    endedAt: z.string(),
    outcome: z.enum(["CREW_WIN", "IMP_WIN"]),
    participants: z.array(participantSchema).min(1),
  })
  .superRefine((data, ctx) => {
    // Validate timestamps are parseable
    const start = Date.parse(data.startedAt);
    const end = Date.parse(data.endedAt);
    if (isNaN(start)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startedAt"], message: "startedAt is not a valid timestamp" });
    }
    if (isNaN(end)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endedAt"], message: "endedAt is not a valid timestamp" });
    }
    if (!isNaN(start) && !isNaN(end) && end < start) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endedAt"], message: "endedAt must be >= startedAt" });
    }

    // Validate unique playerIds within participants
    const ids = data.participants.map((p) => p.playerId);
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["participants"], message: `Duplicate playerId: ${id}` });
        break;
      }
      seen.add(id);
    }

    // Validate per-participant: tasksDone <= tasksTotal
    for (let i = 0; i < data.participants.length; i++) {
      const p = data.participants[i];
      if (p.tasksDone > p.tasksTotal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["participants", i, "tasksDone"],
          message: `tasksDone (${p.tasksDone}) must be <= tasksTotal (${p.tasksTotal})`,
        });
      }
    }

    // Validate at least one IMPOSTOR and one CREW participant
    const hasImp = data.participants.some((p) => p.role === "IMPOSTOR");
    const hasCrew = data.participants.some((p) => p.role === "CREW");
    if (!hasImp) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["participants"], message: "At least one IMPOSTOR participant is required" });
    }
    if (!hasCrew) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["participants"], message: "At least one CREW participant is required" });
    }

    // Validate win outcome consistency
    for (let i = 0; i < data.participants.length; i++) {
      const p = data.participants[i];
      const expectedWon = p.role === "IMPOSTOR" ? data.outcome === "IMP_WIN" : data.outcome === "CREW_WIN";
      if (p.won !== expectedWon) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["participants", i, "won"],
          message: `${p.role} participant won=${p.won} is inconsistent with outcome=${data.outcome}`,
        });
      }
    }
  });

export type MatchPayload = z.infer<typeof matchPayloadSchema>;
