import { describe, expect, it } from "vitest";
import { assertCan, can, PermissionError, PERMISSIONS } from "./permissions";
import { signSession, verifySession } from "./token";

describe("session tokens", () => {
  const secret = "test-secret";
  const now = 1_800_000_000;

  it("accepts a token it signed", () => {
    const token = signSession({ uid: "demo-owner", exp: now + 60 }, secret);
    expect(verifySession(token, secret, now)).toEqual({ uid: "demo-owner", exp: now + 60 });
  });

  it("rejects expired, tampered, wrongly signed and malformed tokens", () => {
    const token = signSession({ uid: "demo-staff", exp: now + 60 }, secret);
    expect(verifySession(token, secret, now + 61)).toBeNull();
    expect(verifySession(token, "other-secret", now)).toBeNull();

    // Swap the body for one claiming to be the owner, keeping the old signature.
    const forgedBody = Buffer.from(JSON.stringify({ uid: "demo-owner", exp: now + 60 })).toString("base64url");
    expect(verifySession(`${forgedBody}.${token.split(".")[1]}`, secret, now)).toBeNull();

    for (const junk of [undefined, "", "abc", "a.b.c", ".", "x."]) {
      expect(verifySession(junk, secret, now)).toBeNull();
    }
  });
});

describe("role permissions", () => {
  it("gives the owner every permission", () => {
    for (const permission of PERMISSIONS) expect(can("owner", permission)).toBe(true);
  });

  it("keeps approvals and money decisions with the owner", () => {
    for (const permission of ["growth.approve", "catering.quote.approve", "catering.deposit.waive", "operations.approve_dispute", "settings.manage", "data.export", "data.reset_demo"] as const) {
      expect(can("manager", permission)).toBe(false);
      expect(can("staff", permission)).toBe(false);
    }
  });

  it("keeps staff away from financial documents and campaigns", () => {
    expect(can("staff", "operations.view")).toBe(false);
    expect(can("staff", "growth.view")).toBe(false);
    expect(can("staff", "settings.view")).toBe(false);
    expect(can("staff", "catering.view")).toBe(true);
    expect(can("staff", "catering.fulfill")).toBe(true);
    expect(can("staff", "catering.manage")).toBe(false);
  });

  it("refuses a missing actor", () => {
    expect(() => assertCan(null, "today.view")).toThrow(PermissionError);
    expect(() => assertCan("staff", "growth.approve")).toThrow(PermissionError);
    expect(() => assertCan("owner", "growth.approve")).not.toThrow();
  });
});
