import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

describe("invite repository", () => {
  it("creates invites with the provided payload", async (t) => {
    const create = t.mock.fn(async ({ data }) => data);

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          inviteToken: { create },
        })),
      },
    });

    const { createInvite } = await importFresh<
      typeof import("../../src/repositories/invite.repo.ts")
    >("../../src/repositories/invite.repo.ts");

    const expiresAt = new Date("2030-01-01T00:00:00.000Z");
    const invite = await createInvite({
      token: "invite-token",
      email: "user@example.com",
      role: "ADMIN",
      teamId: "team-1",
      invitedById: "user-1",
      expiresAt,
    });

    assert.equal(invite.token, "invite-token");
    assert.deepEqual(create.mock.calls.at(0)?.arguments.at(0), {
      data: {
        token: "invite-token",
        email: "user@example.com",
        role: "ADMIN",
        teamId: "team-1",
        invitedById: "user-1",
        expiresAt,
      },
    });
  });

  it("loads invite details with the expected relations", async (t) => {
    const findUnique = t.mock.fn(async () => ({ id: "invite-1" }));

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          inviteToken: { findUnique },
        })),
      },
    });

    const { getInviteByToken } = await importFresh<
      typeof import("../../src/repositories/invite.repo.ts")
    >("../../src/repositories/invite.repo.ts");

    await getInviteByToken("invite-token");

    assert.deepEqual(findUnique.mock.calls.at(0)?.arguments.at(0), {
      where: { token: "invite-token" },
      include: {
        team: true,
        invitedBy: { select: { id: true, name: true, email: true } },
      },
    });
  });

  it("deletes expired invites using the current time cutoff", async (t) => {
    const deleteMany = t.mock.fn(async () => undefined);

    t.mock.module("@/lib/db", {
      namedExports: {
        getPrisma: t.mock.fn(async () => ({
          inviteToken: { deleteMany },
        })),
      },
    });

    const { deleteExpiredInvites } = await importFresh<
      typeof import("../../src/repositories/invite.repo.ts")
    >("../../src/repositories/invite.repo.ts");

    await deleteExpiredInvites();

    const where = (deleteMany.mock.calls.at(0)?.arguments.at(0) as unknown as {
      where: { expiresAt: { lt: Date } };
    }).where;
    assert.ok(where.expiresAt.lt instanceof Date);
  });
});
