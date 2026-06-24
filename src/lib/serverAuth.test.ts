import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { bearerOk } from "./serverAuth";

describe("bearerOk", () => {
  const prev = process.env.INGEST_TOKEN;
  beforeEach(() => { process.env.INGEST_TOKEN = "secret-token-123"; });
  afterEach(() => { process.env.INGEST_TOKEN = prev; });

  it("accepts the correct bearer token", () => {
    expect(bearerOk("Bearer secret-token-123")).toBe(true);
  });
  it("rejects a wrong token", () => {
    expect(bearerOk("Bearer nope")).toBe(false);
  });
  it("rejects a missing header", () => {
    expect(bearerOk(null)).toBe(false);
  });
  it("fails closed when no token is configured", () => {
    delete process.env.INGEST_TOKEN;
    expect(bearerOk("Bearer secret-token-123")).toBe(false);
  });
});
