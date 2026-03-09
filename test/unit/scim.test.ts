import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyScimPatch,
  deriveScimBearerToken,
  filterScimResources,
  verifyScimBearerToken,
} from "../../src/lib/scim.ts";

describe("SCIM helpers", () => {
  it("derives and verifies an app-scoped bearer token", () => {
    process.env.MASTER_ENCRYPTION_KEY =
      "0000000000000000000000000000000000000000000000000000000000000000";

    const token = deriveScimBearerToken("app-123");
    assert.equal(verifyScimBearerToken("app-123", `Bearer ${token}`), true);
    assert.equal(verifyScimBearerToken("app-123", "Bearer wrong-token"), false);
  });

  it("applies SCIM patch operations to nested objects", () => {
    const updated = applyScimPatch(
      {
        userName: "baseline@example.com",
        name: { givenName: "Baseline", familyName: "User" },
        active: true,
      },
      [
        { op: "replace", path: "userName", value: "updated@example.com" },
        { op: "add", path: "name.formatted", value: "Updated User" },
        { op: "remove", path: "active" },
      ],
    );

    assert.deepEqual(updated, {
      userName: "updated@example.com",
      name: {
        givenName: "Baseline",
        familyName: "User",
        formatted: "Updated User",
      },
    });
  });

  it("filters resources by supported eq expressions", () => {
    const resources = [
      {
        id: "1",
        appInstanceId: "app-1",
        resourceType: "USER" as const,
        resourceId: "res-1",
        externalId: "ext-1",
        displayName: "baseline@example.com",
        payload: { userName: "baseline@example.com" },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "2",
        appInstanceId: "app-1",
        resourceType: "USER" as const,
        resourceId: "res-2",
        externalId: "ext-2",
        displayName: "other@example.com",
        payload: { userName: "other@example.com" },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const filtered = filterScimResources(
      resources,
      'userName eq "baseline@example.com"',
    );

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.resourceId, "res-1");
  });
});

