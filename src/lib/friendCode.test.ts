import { describe, it, expect } from "vitest";
import { normalizeFriendCode } from "./friendCode";

describe("normalizeFriendCode", () => {
  it("accepts and lowercases a valid code", () => {
    expect(normalizeFriendCode("GiftedDolphin#5731")).toBe("gifteddolphin#5731");
  });
  it("trims surrounding whitespace", () => {
    expect(normalizeFriendCode("  boldwasp#4821  ")).toBe("boldwasp#4821");
  });
  it("rejects malformed input", () => {
    expect(normalizeFriendCode("nohash1234")).toBeNull(); // no '#'
    expect(normalizeFriendCode("name#")).toBeNull(); // no digits
    expect(normalizeFriendCode("two words#1234")).toBeNull(); // space in name
    expect(normalizeFriendCode("name#12")).toBeNull(); // too few digits
    expect(normalizeFriendCode("")).toBeNull();
    expect(normalizeFriendCode(null)).toBeNull();
    expect(normalizeFriendCode(1234)).toBeNull();
  });
});
