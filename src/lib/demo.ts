/**
 * Demo mode turns on the pick-a-role sign-in and the "preview / demonstration" labels.
 * It is on in local development and off in a production build unless PANGUICH_DEMO_MODE=1
 * is set deliberately. Static pages read this at build time.
 */
export function isDemoMode(): boolean {
  const flag = process.env.PANGUICH_DEMO_MODE;
  if (flag === "1") return true;
  if (flag === "0") return false;
  return process.env.NODE_ENV !== "production";
}

/** Search engines stay blocked until the owner approves a launch and a domain. */
export function isIndexingAllowed(): boolean {
  return process.env.PANGUICH_ALLOW_INDEXING === "1" && !isDemoMode();
}
