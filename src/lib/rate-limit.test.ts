import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("rate limiter", () => {
  it("allows up to the limit, then refuses until the window passes", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect([0, 1, 2].map((t) => limiter.allow("a", t))).toEqual([true, true, true]);
    expect(limiter.allow("a", 500)).toBe(false);
    expect(limiter.allow("b", 500)).toBe(true); // other clients are unaffected
    expect(limiter.allow("a", 1003)).toBe(true);
  });
});
