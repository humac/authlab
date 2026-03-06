import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { getPrisma } from "@/lib/db";
import { hashToken } from "@/lib/token";
import {
  consumeAuthToken,
  createAuthToken,
  deleteExpiredOrUsedAuthTokens,
} from "@/repositories/auth-token.repo";
import {
  createAuthTokenRecord,
  createInvite,
  createJoinRequest,
  createTeam,
  createUser,
  getJson,
  resetDatabase,
} from "./test-helpers.ts";
import { importFresh } from "../unit/test-helpers.ts";

describe("integration: repositories and api routes", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe("auth token repository", () => {
    it("creates, consumes, and cleans up real auth token records", async () => {
      const prisma = await getPrisma();
      const user = await createUser();

      const rawToken = await createAuthToken({
        userId: user.id,
        purpose: "EMAIL_VERIFY",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const stored = await prisma.authToken.findUnique({
        where: { tokenHash: hashToken(rawToken) },
      });
      assert.ok(stored);
      assert.notEqual(stored.tokenHash, rawToken);

      const consumed = await consumeAuthToken({
        token: rawToken,
        purpose: "EMAIL_VERIFY",
      });
      assert.equal(consumed?.userId, user.id);

      await createAuthTokenRecord({
        userId: user.id,
        token: "expired-token",
        purpose: "PASSWORD_RESET",
        expiresAt: new Date(Date.now() - 60 * 1000),
      });

      await deleteExpiredOrUsedAuthTokens();

      const remaining = await prisma.authToken.findMany();
      assert.equal(remaining.length, 0);
    });
  });

  describe("POST /api/user/register", () => {
    it("creates a user, personal team, owner membership, and verification token", async (t) => {
      const sentEmails: Array<{ email: string; name: string; token: string }> = [];
      t.mock.module("@/lib/auth-email", {
        namedExports: {
          sendEmailVerificationLink: t.mock.fn(async (payload) => {
            sentEmails.push(payload);
          }),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/user/register/route.ts")
      >("../../src/app/api/user/register/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/user/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: "ADMIN@Example.com",
            name: "Admin User",
            password: "StrongPassword123!",
          }),
        }),
      );

      assert.equal(response.status, 201);
      assert.deepEqual(await getJson(response), {
        message: "If an account can be created, a verification email has been sent.",
      });

      const prisma = await getPrisma();
      const user = await prisma.user.findUnique({
        where: { email: "admin@example.com" },
      });
      assert.ok(user);
      assert.equal(user.isSystemAdmin, true);
      assert.equal(user.isVerified, false);

      const team = await prisma.team.findFirst({
        where: { slug: `personal-${user.id}` },
      });
      assert.ok(team);
      assert.equal(team.isPersonal, true);

      const membership = await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId: user.id, teamId: team.id } },
      });
      assert.ok(membership);
      assert.equal(membership.role, "OWNER");

      const tokenRecord = await prisma.authToken.findFirst({
        where: { userId: user.id, purpose: "EMAIL_VERIFY" },
      });
      assert.ok(tokenRecord);
      assert.equal(sentEmails.length, 1);
      assert.equal(sentEmails[0]?.email, "admin@example.com");
      assert.equal(hashToken(sentEmails[0]?.token ?? ""), tokenRecord.tokenHash);
    });

    it("returns the generic response for existing unverified users and resends verification", async (t) => {
      const prisma = await getPrisma();
      const user = await createUser({
        email: "pending@example.com",
        isVerified: false,
      });

      const sentEmails: Array<{ email: string; token: string }> = [];
      t.mock.module("@/lib/auth-email", {
        namedExports: {
          sendEmailVerificationLink: t.mock.fn(async (payload) => {
            sentEmails.push(payload);
          }),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/user/register/route.ts")
      >("../../src/app/api/user/register/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/user/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: "pending@example.com",
            name: "Pending User",
            password: "StrongPassword123!",
          }),
        }),
      );

      assert.equal(response.status, 200);
      assert.equal(await prisma.user.count(), 1);
      assert.equal(sentEmails.length, 1);

      const tokenRecord = await prisma.authToken.findFirst({
        where: { userId: user.id, purpose: "EMAIL_VERIFY" },
      });
      assert.ok(tokenRecord);
      assert.equal(hashToken(sentEmails[0]?.token ?? ""), tokenRecord.tokenHash);
    });
  });

  describe("POST /api/invites/accept", () => {
    it("accepts valid invites for the authenticated email and deletes the invite", async (t) => {
      const invitedUser = await createUser({
        email: "invitee@example.com",
      });
      const inviter = await createUser({
        email: "owner@example.com",
      });
      const team = await createTeam({ slug: "invite-team" });
      const invite = await createInvite({
        token: "invite-token",
        email: "invitee@example.com",
        role: "ADMIN",
        teamId: team.id,
        invitedById: inviter.id,
      });

      t.mock.module("@/lib/user-session", {
        namedExports: {
          getCurrentUser: t.mock.fn(async () => ({
            userId: invitedUser.id,
            email: invitedUser.email,
            name: invitedUser.name,
            isSystemAdmin: false,
            mustChangePassword: false,
            isVerified: true,
            mfaEnabled: false,
            activeTeamId: team.id,
          })),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/invites/accept/route.ts")
      >("../../src/app/api/invites/accept/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/invites/accept", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: invite.token }),
        }),
      );

      assert.equal(response.status, 200);
      assert.deepEqual(await getJson(response), {
        ok: true,
        teamId: team.id,
        teamName: team.name,
        role: "ADMIN",
      });

      const prisma = await getPrisma();
      const membership = await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId: invitedUser.id, teamId: team.id } },
      });
      assert.ok(membership);
      assert.equal(membership.role, "ADMIN");
      assert.equal(
        await prisma.inviteToken.findUnique({ where: { id: invite.id } }),
        null,
      );
    });

    it("rejects invites that do not belong to the authenticated email", async (t) => {
      const invitedUser = await createUser({
        email: "different@example.com",
      });
      const inviter = await createUser({
        email: "owner@example.com",
      });
      const team = await createTeam({ slug: "invite-team-2" });
      const invite = await createInvite({
        token: "invite-token-2",
        email: "invitee@example.com",
        teamId: team.id,
        invitedById: inviter.id,
      });

      t.mock.module("@/lib/user-session", {
        namedExports: {
          getCurrentUser: t.mock.fn(async () => ({
            userId: invitedUser.id,
            email: invitedUser.email,
            name: invitedUser.name,
            isSystemAdmin: false,
            mustChangePassword: false,
            isVerified: true,
            mfaEnabled: false,
            activeTeamId: team.id,
          })),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/invites/accept/route.ts")
      >("../../src/app/api/invites/accept/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/invites/accept", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: invite.token }),
        }),
      );

      assert.equal(response.status, 403);
      const prisma = await getPrisma();
      assert.equal(
        await prisma.teamMember.findUnique({
          where: { userId_teamId: { userId: invitedUser.id, teamId: team.id } },
        }),
        null,
      );
      assert.ok(await prisma.inviteToken.findUnique({ where: { id: invite.id } }));
    });
  });

  describe("team join request routes", () => {
    it("creates a join request for a non-member", async (t) => {
      const user = await createUser({
        email: "joiner@example.com",
      });
      const team = await createTeam({ slug: "joinable-team" });

      t.mock.module("@/lib/user-session", {
        namedExports: {
          getCurrentUser: t.mock.fn(async () => ({
            userId: user.id,
            email: user.email,
            name: user.name,
            isSystemAdmin: false,
            mustChangePassword: false,
            isVerified: true,
            mfaEnabled: false,
            activeTeamId: team.id,
          })),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/teams/[id]/join-requests/route.ts")
      >("../../src/app/api/teams/[id]/join-requests/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/teams/joinable-team/join-requests", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ note: "Please let me in", role: "ADMIN" }),
        }),
        { params: Promise.resolve({ id: team.id }) },
      );

      assert.equal(response.status, 201);

      const prisma = await getPrisma();
      const request = await prisma.teamJoinRequest.findFirst({
        where: { userId: user.id, teamId: team.id },
      });
      assert.ok(request);
      assert.equal(request.role, "ADMIN");
      assert.equal(request.note, "Please let me in");
    });

    it("approves join requests through the review route and creates membership", async (t) => {
      const requester = await createUser({
        email: "requester@example.com",
      });
      const reviewer = await createUser({
        email: "admin@example.com",
        isSystemAdmin: true,
      });
      const team = await createTeam({ slug: "review-team" });
      const joinRequest = await createJoinRequest({
        teamId: team.id,
        userId: requester.id,
      });

      t.mock.module("@/lib/user-session", {
        namedExports: {
          getCurrentUser: t.mock.fn(async () => ({
            userId: reviewer.id,
            email: reviewer.email,
            name: reviewer.name,
            isSystemAdmin: true,
            mustChangePassword: false,
            isVerified: true,
            mfaEnabled: false,
            activeTeamId: team.id,
          })),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/teams/join-requests/[requestId]/route.ts")
      >("../../src/app/api/teams/join-requests/[requestId]/route.ts");

      const response = await route.PUT(
        new Request("http://localhost/api/teams/join-requests/review", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "approve", role: "ADMIN" }),
        }),
        { params: Promise.resolve({ requestId: joinRequest.id }) },
      );

      assert.equal(response.status, 200);

      const prisma = await getPrisma();
      const updatedRequest = await prisma.teamJoinRequest.findUnique({
        where: { id: joinRequest.id },
      });
      assert.ok(updatedRequest);
      assert.equal(updatedRequest.status, "APPROVED");
      assert.equal(updatedRequest.reviewedById, reviewer.id);
      assert.equal(updatedRequest.role, "ADMIN");

      const membership = await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId: requester.id, teamId: team.id } },
      });
      assert.ok(membership);
      assert.equal(membership.role, "ADMIN");
    });
  });
});
