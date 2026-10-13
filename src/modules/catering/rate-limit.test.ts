import { describe, expect, it } from "vitest";
import { clientKeyFromForwardedFor, createRateLimiter } from "./rate-limit";

describe("form rate limit", () => {
  it("allows five submissions in ten minutes per address, then waits for the window to pass", () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 600_000 });
    const start = 1_000_000;
    for (let i = 0; i < 5; i += 1) {
      expect(limiter.isLimited("203.0.113.7", start + i * 1000)).toBe(false);
      limiter.hit("203.0.113.7", start + i * 1000);
    }
    expect(limiter.isLimited("203.0.113.7", start + 6000)).toBe(true);
    // Another address is not affected.
    expect(limiter.isLimited("203.0.113.8", start + 6000)).toBe(false);
    // Just before the first submission leaves the window it is still limited; just after, it is not.
    expect(limiter.isLimited("203.0.113.7", start + 599_999)).toBe(true);
    expect(limiter.isLimited("203.0.113.7", start + 600_000)).toBe(false);
  });

  it("does not grow without bound", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 3 });
    for (let i = 0; i < 10; i += 1) limiter.hit(`198.51.100.${i}`, 5000);
    const limited = Array.from({ length: 10 }, (_, i) => limiter.isLimited(`198.51.100.${i}`, 5000)).filter(Boolean);
    expect(limited.length).toBeLessThanOrEqual(3);
  });

  it("reads the client address from x-forwarded-for and falls back to one shared key", () => {
    expect(clientKeyFromForwardedFor("203.0.113.7, 10.0.0.1")).toBe("203.0.113.7");
    expect(clientKeyFromForwardedFor("  2001:db8::1 ")).toBe("2001:db8::1");
    expect(clientKeyFromForwardedFor(null)).toBe("global");
    expect(clientKeyFromForwardedFor("")).toBe("global");
    expect(clientKeyFromForwardedFor("<script>")).toBe("c");
    expect(clientKeyFromForwardedFor("zzz")).toBe("global");
  });
});
