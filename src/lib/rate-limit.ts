/**
 * Small in-memory sliding-window rate limiter. Enough for a single-process demo; a hosted
 * deployment with several instances needs a shared store instead.
 */
export function createRateLimiter(options: { limit: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, number[]>();
  const maxKeys = options.maxKeys ?? 5_000;

  return {
    /** Returns true and counts the request when the key is under its limit. */
    allow(key: string, now: number): boolean {
      const cutoff = now - options.windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
      if (recent.length >= options.limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > maxKeys) {
        for (const [k, times] of hits) {
          if (times.every((t) => t <= cutoff)) hits.delete(k);
          if (hits.size <= maxKeys) break;
        }
      }
      return true;
    },
  };
}
