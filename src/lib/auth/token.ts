import { createHmac, timingSafeEqual } from "node:crypto";

export type SessionPayload = { uid: string; exp: number };

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function signature(body: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

/** Creates a signed, expiring session token. The role is never trusted from the token. */
export function signSession(payload: SessionPayload, secret: string): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${b64url(signature(body, secret))}`;
}

/** Returns the payload only when the signature is valid and the token has not expired. */
export function verifySession(token: string | undefined, secret: string, nowSeconds: number): SessionPayload | null {
  if (!token) return null;
  const [body, sig, ...rest] = token.split(".");
  if (!body || !sig || rest.length > 0) return null;
  const expected = signature(body, secret);
  let provided: Buffer;
  try {
    provided = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp <= nowSeconds) return null;
    return { uid: payload.uid, exp: payload.exp };
  } catch {
    return null;
  }
}
