import { randomBytes, randomUUID } from "node:crypto";

export function newId(): string {
  return randomUUID();
}

// No 0/O/1/I/L so a reference read over the phone is unambiguous.
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Short human-friendly reference such as "CAT-7F3K2A". Not a secret. */
export function newReference(prefix: string, length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return `${prefix}-${out}`;
}
