/**
 * A small in-memory limit on how often one client address can send the public catering form.
 *
 * It lives in this server process only (it resets on restart and is not shared between
 * servers), which is enough for a single-server demonstration. A hosted pilot should move
 * this to the platform's rate limiting.
 */

export type RateLimiter = {
  /** True when this key has already used up its allowance inside the window. */
  isLimited(key: string, nowMs: number): boolean;
  /** Counts one accepted submission for this key. */
  hit(key: string, nowMs: number): void;
  reset(): void;
};

export function createRateLimiter(options: { limit: number; windowMs: number; maxKeys?: number }): RateLimiter {
  const { limit, windowMs } = options;
  const maxKeys = options.maxKeys ?? 5000;
  const hits = new Map<string, number[]>();

  const recent = (key: string, nowMs: number): number[] => {
    const kept = (hits.get(key) ?? []).filter((at) => nowMs - at < windowMs);
    if (kept.length > 0) hits.set(key, kept);
    else hits.delete(key);
    return kept;
  };

  return {
    isLimited(key, nowMs) {
      return recent(key, nowMs).length >= limit;
    },
    hit(key, nowMs) {
      const kept = recent(key, nowMs);
      kept.push(nowMs);
      hits.set(key, kept);
      if (hits.size > maxKeys) {
        // Forget addresses whose window has passed; if still too many, drop the oldest entries.
        for (const other of [...hits.keys()]) recent(other, nowMs);
        for (const other of hits.keys()) {
          if (hits.size <= maxKeys) break;
          hits.delete(other);
        }
      }
    },
    reset() {
      hits.clear();
    },
  };
}

/**
 * The address a request came from, taken from the first entry of `x-forwarded-for`.
 * When there is none, every such request shares one "global" allowance.
 */
export function clientKeyFromForwardedFor(header: string | null | undefined): string {
  const first = header?.split(",")[0]?.trim() ?? "";
  // Keep only characters that can appear in an IP address, and cap the length.
  const cleaned = first.replace(/[^0-9a-fA-F:.]/g, "").slice(0, 45);
  return cleaned || "global";
}

export const FORM_WINDOW_MS = 10 * 60 * 1000;
export const FORM_LIMIT_DEFAULT = 5;
/** Everything together, whatever address is claimed (the header can be forged). */
export const FORM_OVERALL_FACTOR = 12;

/** Per-address allowance. `PANGUICH_CATERING_FORM_LIMIT` can raise it for automated browser tests. */
export function formLimit(): number {
  const configured = Number(process.env.PANGUICH_CATERING_FORM_LIMIT);
  return Number.isInteger(configured) && configured > 0 ? configured : FORM_LIMIT_DEFAULT;
}

type Limiters = { limit: number; perClient: RateLimiter; overall: RateLimiter };
const holder = globalThis as unknown as { __panguichCateringLimiters?: Limiters };

/** One pair of limiters per server process, kept across hot reloads. */
export function cateringFormLimiters(): Limiters {
  const limit = formLimit();
  if (!holder.__panguichCateringLimiters || holder.__panguichCateringLimiters.limit !== limit) {
    holder.__panguichCateringLimiters = {
      limit,
      perClient: createRateLimiter({ limit, windowMs: FORM_WINDOW_MS }),
      overall: createRateLimiter({ limit: limit * FORM_OVERALL_FACTOR, windowMs: FORM_WINDOW_MS, maxKeys: 1 }),
    };
  }
  return holder.__panguichCateringLimiters;
}
