import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildClaimsDiffEntries } from "../../src/lib/claims-diff.ts";

describe("buildClaimsDiffEntries", () => {
  it("classifies added, removed, changed, and unchanged claims", () => {
    const entries = buildClaimsDiffEntries(
      {
        sub: "user-123",
        email: "new@example.com",
        groups: ["engineering", "admin"],
        profile: { family_name: "Nguyen", given_name: "Huy" },
      },
      {
        sub: "user-123",
        email: "old@example.com",
        role: "member",
        profile: { given_name: "Huy", family_name: "Nguyen" },
      },
    );

    assert.deepEqual(
      entries.map((entry) => [entry.key, entry.status]),
      [
        ["email", "changed"],
        ["groups", "added"],
        ["profile", "unchanged"],
        ["role", "removed"],
        ["sub", "unchanged"],
      ],
    );
  });

  it("treats nested object key order as unchanged", () => {
    const entries = buildClaimsDiffEntries(
      {
        context: {
          amr: ["pwd", "mfa"],
          acr: "urn:authlab:mfa",
        },
      },
      {
        context: {
          acr: "urn:authlab:mfa",
          amr: ["pwd", "mfa"],
        },
      },
    );

    assert.equal(entries[0]?.status, "unchanged");
  });
});

