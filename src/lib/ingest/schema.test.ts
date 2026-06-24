import { describe, it, expect } from "vitest";
import { matchPayloadSchema } from "./schema";

const validPayload = {
  matchCode: "SCHEMA-TEST-1",
  startedAt: new Date("2025-01-01T10:00:00.000Z").toISOString(),
  endedAt: new Date("2025-01-01T10:30:00.000Z").toISOString(),
  outcome: "IMP_WIN" as const,
  participants: [
    { discordId: "imp-a", role: "IMPOSTOR" as const, won: true, kills: 2, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true },
    { discordId: "crew-a", role: "CREW" as const, won: false, kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 3, tasksTotal: 5, survived: false },
  ],
};

describe("matchPayloadSchema", () => {
  it("accepts a valid IMP_WIN payload", () => {
    const result = matchPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("rejects a CREW participant with won:true when outcome is IMP_WIN", () => {
    const bad = {
      ...validPayload,
      participants: [
        { discordId: "imp-b", role: "IMPOSTOR" as const, won: true, kills: 1, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true },
        { discordId: "crew-b", role: "CREW" as const, won: true, kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 2, tasksTotal: 5, survived: false },
      ],
    };
    const result = matchPayloadSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues.map((i) => i.message);
      expect(issues.some((m) => m.includes("CREW") && m.includes("IMP_WIN"))).toBe(true);
    }
  });

  it("rejects payload with tasksDone > tasksTotal", () => {
    const bad = {
      ...validPayload,
      participants: [
        { discordId: "imp-c", role: "IMPOSTOR" as const, won: true, kills: 1, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true },
        { discordId: "crew-c", role: "CREW" as const, won: false, kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 10, tasksTotal: 5, survived: false },
      ],
    };
    const result = matchPayloadSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues.map((i) => i.message);
      expect(issues.some((m) => m.includes("tasksDone"))).toBe(true);
    }
  });

  it("rejects payload with duplicate discordIds", () => {
    const bad = {
      ...validPayload,
      participants: [
        { discordId: "dup-id", role: "IMPOSTOR" as const, won: true, kills: 1, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true },
        { discordId: "dup-id", role: "CREW" as const, won: false, kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 2, tasksTotal: 5, survived: false },
      ],
    };
    const result = matchPayloadSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues.map((i) => i.message);
      expect(issues.some((m) => m.includes("Duplicate discordId"))).toBe(true);
    }
  });

  it("rejects payload where endedAt is before startedAt", () => {
    const bad = {
      ...validPayload,
      startedAt: new Date("2025-01-01T10:30:00.000Z").toISOString(),
      endedAt: new Date("2025-01-01T10:00:00.000Z").toISOString(),
    };
    const result = matchPayloadSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues.map((i) => i.message);
      expect(issues.some((m) => m.includes("endedAt must be >= startedAt"))).toBe(true);
    }
  });

  it("rejects payload with no IMPOSTOR participant", () => {
    const bad = {
      ...validPayload,
      outcome: "CREW_WIN" as const,
      participants: [
        { discordId: "crew-x", role: "CREW" as const, won: true, kills: 0, correctShots: 0, incorrectShots: 0, tasksDone: 3, tasksTotal: 5, survived: true },
      ],
    };
    const result = matchPayloadSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues.map((i) => i.message);
      expect(issues.some((m) => m.includes("IMPOSTOR"))).toBe(true);
    }
  });

  it("rejects payload with no CREW participant", () => {
    const bad = {
      ...validPayload,
      participants: [
        { discordId: "imp-y", role: "IMPOSTOR" as const, won: true, kills: 1, correctShots: 0, incorrectShots: 0, tasksDone: 0, tasksTotal: 0, survived: true },
      ],
    };
    const result = matchPayloadSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues.map((i) => i.message);
      expect(issues.some((m) => m.includes("CREW"))).toBe(true);
    }
  });
});
