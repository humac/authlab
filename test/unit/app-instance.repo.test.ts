import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

function buildAppRecord(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: "app-1",
    name: "Okta Sandbox",
    slug: "okta-sandbox",
    protocol: "OIDC",
    teamId: "team-1",
    issuerUrl: "https://issuer.example.com",
    clientId: "client-id",
    clientSecret: "enc:secret",
    scopes: "openid profile email",
    entryPoint: null,
    issuer: null,
    idpCert: "enc:cert",
    buttonColor: "#3B71CA",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("app instance repository", () => {
  it("encrypts secrets on create and redacts them in the response", async (t) => {
    const create = t.mock.fn(async ({ data }) => buildAppRecord(data));

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          appInstance: { create },
        })),
      },
    });
    t.mock.module("@/lib/encryption", {
      namedExports: {
        encrypt: t.mock.fn((value: string) => `enc:${value}`),
        decrypt: t.mock.fn((value: string) => `dec:${value}`),
      },
    });

    const { createAppInstance } = await importFresh<
      typeof import("../../src/repositories/app-instance.repo.ts")
    >("../../src/repositories/app-instance.repo.ts");

    const result = await createAppInstance({
      name: "Okta Sandbox",
      slug: "okta-sandbox",
      protocol: "OIDC",
      teamId: "team-1",
      issuerUrl: "https://issuer.example.com",
      clientId: "client-id",
      clientSecret: "super-secret",
      scopes: "openid profile email",
      idpCert: "certificate",
      buttonColor: "#3B71CA",
    });

    assert.equal(create.mock.calls.length, 1);
    const createArgs = create.mock.calls.at(0)?.arguments.at(0) as {
      data: { clientSecret: string; idpCert: string };
    };
    assert.equal(createArgs.data.clientSecret, "enc:super-secret");
    assert.equal(createArgs.data.idpCert, "enc:certificate");
    assert.equal(result.hasClientSecret, true);
    assert.equal(result.hasIdpCert, true);
    assert.equal("clientSecret" in result, false);
    assert.equal("idpCert" in result, false);
  });

  it("decrypts secrets when fetching an app instance by slug", async (t) => {
    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          appInstance: {
            findUnique: t.mock.fn(async () => buildAppRecord()),
          },
        })),
      },
    });
    t.mock.module("@/lib/encryption", {
      namedExports: {
        encrypt: t.mock.fn((value: string) => `enc:${value}`),
        decrypt: t.mock.fn((value: string) => value.replace(/^enc:/, "")),
      },
    });

    const { getAppInstanceBySlug } = await importFresh<
      typeof import("../../src/repositories/app-instance.repo.ts")
    >("../../src/repositories/app-instance.repo.ts");

    const result = await getAppInstanceBySlug("okta-sandbox");

    assert.equal(result?.clientSecret, "secret");
    assert.equal(result?.idpCert, "cert");
  });

  it("updates encrypted fields and clears secrets when null is provided", async (t) => {
    const update = t.mock.fn(async ({ data }) => buildAppRecord(data));

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          appInstance: { update },
        })),
      },
    });
    t.mock.module("@/lib/encryption", {
      namedExports: {
        encrypt: t.mock.fn((value: string) => `enc:${value}`),
        decrypt: t.mock.fn((value: string) => value),
      },
    });

    const { updateAppInstance } = await importFresh<
      typeof import("../../src/repositories/app-instance.repo.ts")
    >("../../src/repositories/app-instance.repo.ts");

    const result = await updateAppInstance("app-1", {
      clientSecret: null,
      idpCert: "next-cert",
    });

    const updateArgs = update.mock.calls.at(0)?.arguments.at(0) as {
      data: { clientSecret: null; idpCert: string };
    };
    assert.equal(updateArgs.data.clientSecret, null);
    assert.equal(updateArgs.data.idpCert, "enc:next-cert");
    assert.equal(result.hasClientSecret, false);
    assert.equal(result.hasIdpCert, true);
  });

  it("copies an app instance into another team with a unique copy name and slug", async (t) => {
    const findUnique = t.mock.fn(async ({ where }: { where: Record<string, string> }) => {
      if (where.id === "app-1") {
        return buildAppRecord();
      }

      if (where.slug === "okta-sandbox-copy") {
        return { id: "existing-copy" };
      }

      if (where.slug === "okta-sandbox-copy-2") {
        return null;
      }

      return null;
    });
    const create = t.mock.fn(async ({ data }) => buildAppRecord({
      ...data,
      id: "app-2",
      clientSecret: data.clientSecret,
      idpCert: data.idpCert,
    }));

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          appInstance: {
            findUnique,
            create,
          },
        })),
      },
    });
    t.mock.module("@/lib/encryption", {
      namedExports: {
        encrypt: t.mock.fn((value: string) => `enc:${value}`),
        decrypt: t.mock.fn((value: string) => value.replace(/^enc:/, "")),
      },
    });

    const { copyAppInstanceToTeam } = await importFresh<
      typeof import("../../src/repositories/app-instance.repo.ts")
    >("../../src/repositories/app-instance.repo.ts");

    const result = await copyAppInstanceToTeam("app-1", "team-2");

    const createArgs = create.mock.calls.at(0)?.arguments.at(0) as {
      data: { name: string; slug: string; teamId: string; clientSecret: string; idpCert: string };
    };
    assert.equal(createArgs.data.name, "Okta Sandbox (Copy 2)");
    assert.equal(createArgs.data.slug, "okta-sandbox-copy-2");
    assert.equal(createArgs.data.teamId, "team-2");
    assert.equal(createArgs.data.clientSecret, "enc:secret");
    assert.equal(createArgs.data.idpCert, "enc:cert");
    assert.equal(result.slug, "okta-sandbox-copy-2");
    assert.equal(result.hasClientSecret, true);
  });

  it("claims legacy migration apps for a real team id", async (t) => {
    const updateMany = t.mock.fn(async () => ({ count: 3 }));

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          appInstance: { updateMany },
        })),
      },
    });
    t.mock.module("@/lib/encryption", {
      namedExports: {
        encrypt: t.mock.fn((value: string) => value),
        decrypt: t.mock.fn((value: string) => value),
      },
    });

    const { claimLegacyMigrationAppsForTeam } = await importFresh<
      typeof import("../../src/repositories/app-instance.repo.ts")
    >("../../src/repositories/app-instance.repo.ts");

    assert.equal(await claimLegacyMigrationAppsForTeam("team-9"), 3);
    assert.deepEqual(updateMany.mock.calls.at(0)?.arguments.at(0), {
      where: { teamId: "legacy_migration_team" },
      data: { teamId: "team-9" },
    });
  });
});
