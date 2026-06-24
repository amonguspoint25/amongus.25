import { z } from "zod";
export const participantSchema = z.object({
  discordId: z.string(),
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
});
export const matchPayloadSchema = z.object({
  matchCode: z.string(),
  map: z.string().optional(),
  startedAt: z.string(),
  endedAt: z.string(),
  outcome: z.enum(["CREW_WIN", "IMP_WIN"]),
  participants: z.array(participantSchema).min(1),
});
export type MatchPayload = z.infer<typeof matchPayloadSchema>;
