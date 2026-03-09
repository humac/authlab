import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { getPrisma } from "@/lib/db";
import { deriveScimBearerToken } from "@/lib/scim";
import { hashToken } from "@/lib/token";
import {
  completeAuthRun,
  createAuthRun,
  listBackchannelLogoutCandidates,
  markAuthRunsLoggedOut,
} from "@/repositories/auth-run.repo";
import {
  consumeAuthToken,
  createAuthToken,
  deleteExpiredOrUsedAuthTokens,
} from "@/repositories/auth-token.repo";
import {
  addTeamMember,
  createAuthTokenRecord,
  createCredentialRecord,
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

  describe("auth run repository", () => {
    it("matches back-channel logout candidates by sid before falling back to sub", async () => {
      const team = await createTeam({ slug: "oidc-team" });
      const prisma = await getPrisma();
      const app = await prisma.appInstance.create({
        data: {
          name: "OIDC App",
          slug: "oidc-app",
          protocol: "OIDC",
          teamId: team.id,
          issuerUrl: "https://issuer.example.com",
          clientId: "client-123",
        },
      });

      const sidRun = await createAuthRun({
        appInstanceId: app.id,
        protocol: "OIDC",
        loginState: "state-sid",
      });
      await completeAuthRun(sidRun.id, {
        claims: { sub: "user-123", sid: "sid-123" },
        oidcSubject: "user-123",
        oidcSessionId: "sid-123",
      });

      const subRun = await createAuthRun({
        appInstanceId: app.id,
        protocol: "OIDC",
        loginState: "state-sub",
      });
      await completeAuthRun(subRun.id, {
        claims: { sub: "user-123" },
        oidcSubject: "user-123",
      });

      const sidMatches = await listBackchannelLogoutCandidates({
        appInstanceId: app.id,
        oidcSessionId: "sid-123",
        oidcSubject: "user-123",
      });
      assert.deepEqual(
        sidMatches.map((run) => run.id),
        [sidRun.id],
      );

      const subMatches = await listBackchannelLogoutCandidates({
        appInstanceId: app.id,
        oidcSubject: "user-123",
      });
      assert.deepEqual(
        subMatches.map((run) => run.id).sort(),
        [sidRun.id, subRun.id].sort(),
      );

      const loggedOutCount = await markAuthRunsLoggedOut([sidRun.id, subRun.id]);
      assert.equal(loggedOutCount, 2);

      const remainingMatches = await listBackchannelLogoutCandidates({
        appInstanceId: app.id,
        oidcSubject: "user-123",
      });
      assert.equal(remainingMatches.length, 0);
    });

    it("accepts front-channel logout callbacks and marks matching runs logged out", async (t) => {
      const team = await createTeam({ slug: "frontchannel-team" });
      const prisma = await getPrisma();
      const app = await prisma.appInstance.create({
        data: {
          name: "Front-channel OIDC",
          slug: "frontchannel-oidc",
          protocol: "OIDC",
          teamId: team.id,
          issuerUrl: "https://issuer.example.com",
          clientId: "client-123",
        },
      });

      const run = await createAuthRun({
        appInstanceId: app.id,
        protocol: "OIDC",
        loginState: "frontchannel-state",
      });
      await completeAuthRun(run.id, {
        claims: { sub: "user-123", sid: "sid-123" },
        oidcSubject: "user-123",
        oidcSessionId: "sid-123",
      });

      const clearAppSession = t.mock.fn(async () => {});
      t.mock.module("@/lib/session", {
        namedExports: {
          getActiveAuthRun: t.mock.fn(async () => null),
          clearAppSession,
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/frontchannel-logout/[slug]/route.ts")
      >("../../src/app/api/auth/frontchannel-logout/[slug]/route.ts");

      const response = await route.GET(
        new Request(
          "http://localhost/api/auth/frontchannel-logout/frontchannel-oidc?iss=https%3A%2F%2Fissuer.example.com&sid=sid-123",
        ),
        { params: Promise.resolve({ slug: "frontchannel-oidc" }) },
      );

      assert.equal(response.status, 200);
      const updatedRun = await prisma.authRun.findUnique({ where: { id: run.id } });
      assert.equal(updatedRun?.status, "LOGGED_OUT");
      const events = await prisma.authRunEvent.findMany({
        where: { authRunId: run.id },
      });
      assert.equal(events.some((event) => event.type === "FRONTCHANNEL_LOGGED_OUT"), true);
      assert.equal(clearAppSession.mock.callCount(), 0);
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

      assert.equal(response.status, 200);
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

  describe("OIDC callback route", () => {
    it("stores auth results and redirects to the inspector on a valid callback", async (t) => {
      const session = { save: t.mock.fn(async () => undefined) };
      const saveAuthResultSession = t.mock.fn(async () => undefined);
      const createAuthRunEvent = t.mock.fn(async () => undefined);

      class MockOIDCHandler {
        async handleCallback() {
          return {
            claims: { sub: "user-1" },
            rawTokenResponse: "{\"token\":\"raw\"}",
            idToken: "eyJhbGciOiJSUzI1NiIsImtpZCI6ImtpZC0xIn0.eyJzdWIiOiJ1c2VyLTEifQ.signature",
            accessToken: "access-token",
          };
        }
      }

      t.mock.module("@/lib/state-store", {
        namedExports: {
          getState: t.mock.fn(async () => ({
            slug: "oidc-app",
            codeVerifier: "verifier-1",
            runId: "run-1",
          })),
        },
      });
      t.mock.module("@/repositories/app-instance.repo", {
        namedExports: {
          getAppInstanceBySlug: t.mock.fn(async () => ({
            id: "app-1",
            slug: "oidc-app",
            protocol: "OIDC",
          })),
        },
      });
      t.mock.module("@/lib/oidc-handler", {
        namedExports: { OIDCHandler: MockOIDCHandler },
      });
      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          getAuthRunById: t.mock.fn(async () => ({
            id: "run-1",
            nonce: "nonce-1",
          })),
          createAuthRunEvent,
          completeAuthRun: t.mock.fn(async () => ({
            id: "run-1",
            authenticatedAt: new Date("2026-03-07T12:00:00.000Z"),
          })),
          markAuthRunFailed: t.mock.fn(async () => undefined),
        },
      });
      t.mock.module("@/lib/session", {
        namedExports: {
          getAppSession: t.mock.fn(async () => session),
          saveAuthResultSession,
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/callback/oidc/[slug]/route.ts")
      >("../../src/app/api/auth/callback/oidc/[slug]/route.ts");

      const response = await route.GET(
        new Request(
          "http://localhost/api/auth/callback/oidc/oidc-app?state=state-1&code=authorization-code-123",
        ),
        { params: Promise.resolve({ slug: "oidc-app" }) },
      );

      assert.equal(response.status, 307);
      assert.equal(
        response.headers.get("location"),
        "http://localhost:3000/test/oidc-app/inspector",
      );
      assert.deepEqual(saveAuthResultSession.mock.calls.at(0)?.arguments.at(1), {
        runId: "run-1",
        slug: "oidc-app",
        protocol: "OIDC",
        authenticatedAt: "2026-03-07T12:00:00.000Z",
      });
      const authEvent = createAuthRunEvent.mock.calls.at(0)?.arguments.at(0) as
        | { metadata?: Record<string, unknown> }
        | undefined;
      assert.equal(typeof authEvent?.metadata?.expectedCHash, "string");
    });

    it("rejects mismatched callback slugs", async (t) => {
      t.mock.module("@/lib/state-store", {
        namedExports: {
          getState: t.mock.fn(async () => ({
            slug: "other-app",
            codeVerifier: "verifier-1",
            runId: "run-1",
          })),
        },
      });
      t.mock.module("@/repositories/app-instance.repo", {
        namedExports: { getAppInstanceBySlug: t.mock.fn() },
      });
      t.mock.module("@/lib/oidc-handler", {
        namedExports: { OIDCHandler: class OIDCHandler {} },
      });
      t.mock.module("@/lib/session", {
        namedExports: {
          getAppSession: t.mock.fn(),
          saveAuthResultSession: t.mock.fn(),
        },
      });
      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          getAuthRunById: t.mock.fn(async () => ({ id: "run-1", nonce: "nonce-1" })),
          createAuthRunEvent: t.mock.fn(async () => undefined),
          completeAuthRun: t.mock.fn(async () => ({ id: "run-1" })),
          markAuthRunFailed: t.mock.fn(async () => undefined),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/callback/oidc/[slug]/route.ts")
      >("../../src/app/api/auth/callback/oidc/[slug]/route.ts");

      const response = await route.GET(
        new Request("http://localhost/api/auth/callback/oidc/oidc-app?state=state-1"),
        { params: Promise.resolve({ slug: "oidc-app" }) },
      );

      assert.equal(response.status, 400);
      assert.deepEqual(await getJson(response), {
        error: "Callback slug does not match login session",
      });
    });
  });

  describe("SAML callback route", () => {
    it("stores auth results and redirects with 303 on success", async (t) => {
      const session = { save: t.mock.fn(async () => undefined) };
      const saveAuthResultSession = t.mock.fn(async () => undefined);

      class MockSAMLHandler {
        async handleCallback() {
          return {
            claims: { sub: "user-1" },
            rawXml: "<Assertion />",
          };
        }
      }

      t.mock.module("@/lib/state-store", {
        namedExports: {
          getState: t.mock.fn(async () => ({ slug: "saml-app", runId: "run-2" })),
        },
      });
      t.mock.module("@/repositories/app-instance.repo", {
        namedExports: {
          getAppInstanceBySlug: t.mock.fn(async () => ({
            id: "app-1",
            slug: "saml-app",
            protocol: "SAML",
          })),
        },
      });
      t.mock.module("@/lib/saml-handler", {
        namedExports: { SAMLHandler: MockSAMLHandler },
      });
      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          getAuthRunById: t.mock.fn(async () => ({ id: "run-2" })),
          completeAuthRun: t.mock.fn(async () => ({
            id: "run-2",
            authenticatedAt: new Date("2026-03-07T12:00:00.000Z"),
          })),
          createAuthRun: t.mock.fn(async () => ({ id: "run-2" })),
          createAuthRunEvent: t.mock.fn(async () => undefined),
          markAuthRunFailed: t.mock.fn(async () => undefined),
        },
      });
      t.mock.module("@/lib/session", {
        namedExports: {
          getAppSession: t.mock.fn(async () => session),
          saveAuthResultSession,
        },
      });

      const body = new URLSearchParams({
        SAMLResponse: "response",
        RelayState: "relay-state",
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/callback/saml/[slug]/route.ts")
      >("../../src/app/api/auth/callback/saml/[slug]/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/auth/callback/saml/saml-app", {
          method: "POST",
          body,
        }),
        { params: Promise.resolve({ slug: "saml-app" }) },
      );

      assert.equal(response.status, 303);
      assert.equal(
        response.headers.get("location"),
        "http://localhost:3000/test/saml-app/inspector",
      );
      assert.deepEqual(saveAuthResultSession.mock.calls.at(0)?.arguments.at(1), {
        runId: "run-2",
        slug: "saml-app",
        protocol: "SAML",
        authenticatedAt: "2026-03-07T12:00:00.000Z",
      });
    });

    it("allows IdP-initiated callback without RelayState on slug callback", async (t) => {
      const getState = t.mock.fn(async () => null);
      const saveAuthResultSession = t.mock.fn(async () => undefined);

      class MockSAMLHandler {
        async handleCallback() {
          return {
            claims: { sub: "user-1" },
            rawXml: "<Assertion />",
          };
        }
      }

      t.mock.module("@/lib/state-store", {
        namedExports: { getState },
      });
      t.mock.module("@/repositories/app-instance.repo", {
        namedExports: {
          getAppInstanceBySlug: t.mock.fn(async () => ({
            id: "app-1",
            slug: "saml-app",
            protocol: "SAML",
          })),
        },
      });
      t.mock.module("@/lib/saml-handler", {
        namedExports: { SAMLHandler: MockSAMLHandler },
      });
      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          createAuthRun: t.mock.fn(async () => ({ id: "run-3" })),
          getAuthRunById: t.mock.fn(async () => null),
          completeAuthRun: t.mock.fn(async () => ({
            id: "run-3",
            authenticatedAt: new Date("2026-03-07T12:00:00.000Z"),
          })),
          createAuthRunEvent: t.mock.fn(async () => undefined),
          markAuthRunFailed: t.mock.fn(async () => undefined),
        },
      });
      t.mock.module("@/lib/session", {
        namedExports: {
          getAppSession: t.mock.fn(async () => ({ save: t.mock.fn(async () => undefined) })),
          saveAuthResultSession,
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/callback/saml/[slug]/route.ts")
      >("../../src/app/api/auth/callback/saml/[slug]/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/auth/callback/saml/saml-app", {
          method: "POST",
          body: new URLSearchParams({ SAMLResponse: "response" }),
        }),
        { params: Promise.resolve({ slug: "saml-app" }) },
      );

      assert.equal(response.status, 303);
      assert.equal(
        response.headers.get("location"),
        "http://localhost:3000/test/saml-app/inspector",
      );
      assert.equal(getState.mock.callCount(), 0);
      assert.equal(saveAuthResultSession.mock.callCount(), 1);
    });

    it("rejects invalid RelayState when RelayState is provided", async (t) => {
      t.mock.module("@/lib/state-store", {
        namedExports: { getState: t.mock.fn(async () => null) },
      });
      t.mock.module("@/repositories/app-instance.repo", {
        namedExports: { getAppInstanceBySlug: t.mock.fn() },
      });
      t.mock.module("@/lib/saml-handler", {
        namedExports: { SAMLHandler: class SAMLHandler {} },
      });
      t.mock.module("@/lib/session", {
        namedExports: {
          getAppSession: t.mock.fn(),
          saveAuthResultSession: t.mock.fn(),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/callback/saml/[slug]/route.ts")
      >("../../src/app/api/auth/callback/saml/[slug]/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/auth/callback/saml/saml-app", {
          method: "POST",
          body: new URLSearchParams({
            SAMLResponse: "response",
            RelayState: "stale-state",
          }),
        }),
        { params: Promise.resolve({ slug: "saml-app" }) },
      );

      assert.equal(response.status, 400);
      assert.deepEqual(await getJson(response), {
        error:
          "Invalid or expired RelayState. This is often caused by an expired flow, missing state cookie, or IdP not returning RelayState.",
      });
    });
  });

  describe("SAML phase 3 routes", () => {
    it("starts SP-initiated SAML logout and redirects to the IdP", async (t) => {
      const setAuthRunLogoutState = t.mock.fn(async () => undefined);

      t.mock.module("@/repositories/app-instance.repo", {
        namedExports: {
          getAppInstanceBySlug: t.mock.fn(async () => ({
            id: "app_saml",
            name: "SAML App",
            slug: "saml-app",
            protocol: "SAML",
            teamId: "team_1",
            issuerUrl: null,
            clientId: null,
            clientSecret: null,
            scopes: null,
            customAuthParams: [],
            pkceMode: "S256",
            entryPoint: "https://idp.example.com/sso/saml",
            samlLogoutUrl: "https://idp.example.com/logout/saml",
            issuer: "https://authlab.example.com/sp",
            idpCert: "pem",
            nameIdFormat: null,
            requestedAuthnContext: null,
            forceAuthnDefault: false,
            isPassiveDefault: false,
            samlSignatureAlgorithm: "SHA256",
            clockSkewToleranceSeconds: 0,
            signAuthnRequests: false,
            spSigningPrivateKey: null,
            spSigningCert: null,
            spEncryptionPrivateKey: null,
            spEncryptionCert: null,
            buttonColor: "#3B71CA",
            createdAt: new Date("2026-03-08T00:00:00.000Z"),
            updatedAt: new Date("2026-03-08T00:00:00.000Z"),
          })),
        },
      });
      t.mock.module("@/lib/session", {
        namedExports: {
          getActiveAuthRun: t.mock.fn(async () => ({
            id: "run_saml_1",
            protocol: "SAML",
            claims: {
              nameID: "user@example.com",
              nameIDFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
              sessionIndex: "_session123",
            },
          })),
        },
      });
      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          setAuthRunLogoutState,
        },
      });
      t.mock.module("@/lib/token", {
        namedExports: {
          generateOpaqueToken: t.mock.fn(() => "logout-state-123"),
        },
      });
      t.mock.module("@/lib/saml-handler", {
        namedExports: {
          SAMLHandler: class {
            async buildLogoutUrl() {
              return "https://idp.example.com/logout/saml?RelayState=logout-state-123";
            }
          },
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/logout/saml/[slug]/route.ts")
      >("../../src/app/api/auth/logout/saml/[slug]/route.ts");

      const response = await route.GET(
        new Request("http://localhost/api/auth/logout/saml/saml-app"),
        { params: Promise.resolve({ slug: "saml-app" }) },
      );

      assert.equal(response.status, 307);
      assert.equal(
        response.headers.get("location"),
        "https://idp.example.com/logout/saml?RelayState=logout-state-123",
      );
      assert.equal(setAuthRunLogoutState.mock.callCount(), 1);
    });

    it("completes SP-initiated SAML logout responses and clears the local session", async (t) => {
      const markAuthRunLoggedOut = t.mock.fn(async () => undefined);
      const clearAppSession = t.mock.fn(async () => undefined);

      t.mock.module("@/repositories/app-instance.repo", {
        namedExports: {
          getAppInstanceBySlug: t.mock.fn(async () => ({
            id: "app_saml",
            name: "SAML App",
            slug: "saml-app",
            protocol: "SAML",
            teamId: "team_1",
            issuerUrl: null,
            clientId: null,
            clientSecret: null,
            scopes: null,
            customAuthParams: [],
            pkceMode: "S256",
            entryPoint: "https://idp.example.com/sso/saml",
            samlLogoutUrl: "https://idp.example.com/logout/saml",
            issuer: "https://authlab.example.com/sp",
            idpCert: "pem",
            nameIdFormat: null,
            requestedAuthnContext: null,
            forceAuthnDefault: false,
            isPassiveDefault: false,
            samlSignatureAlgorithm: "SHA256",
            clockSkewToleranceSeconds: 0,
            signAuthnRequests: false,
            spSigningPrivateKey: null,
            spSigningCert: null,
            spEncryptionPrivateKey: null,
            spEncryptionCert: null,
            buttonColor: "#3B71CA",
            createdAt: new Date("2026-03-08T00:00:00.000Z"),
            updatedAt: new Date("2026-03-08T00:00:00.000Z"),
          })),
        },
      });
      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          getAuthRunByLogoutState: t.mock.fn(async () => ({ id: "run_saml_1" })),
          markAuthRunLoggedOut,
        },
      });
      t.mock.module("@/lib/session", {
        namedExports: {
          clearAppSession,
          getActiveAuthRun: t.mock.fn(async () => null),
        },
      });
      t.mock.module("@/lib/saml-handler", {
        namedExports: {
          SAMLHandler: class {
            async handleLogoutRedirect() {
              return { kind: "response", loggedOut: true, profile: null };
            }
          },
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/logout/saml/[slug]/callback/route.ts")
      >("../../src/app/api/auth/logout/saml/[slug]/callback/route.ts");

      const response = await route.GET(
        new Request(
          "http://localhost/api/auth/logout/saml/saml-app/callback?SAMLResponse=abc&RelayState=logout-state-123",
        ),
        { params: Promise.resolve({ slug: "saml-app" }) },
      );

      assert.equal(response.status, 307);
      assert.equal(response.headers.get("location"), "http://localhost:3000/test/saml-app");
      assert.equal(markAuthRunLoggedOut.mock.callCount(), 1);
      assert.equal(clearAppSession.mock.callCount(), 1);
    });

    it("handles IdP-initiated SAML logout requests and returns a logout response", async (t) => {
      const markAuthRunLoggedOut = t.mock.fn(async () => undefined);
      const clearAppSession = t.mock.fn(async () => undefined);
      const buildLogoutResponseUrl = t.mock.fn(
        async (_callbackUrl: string, relayState: string, _profile: Record<string, unknown>, success: boolean) =>
          `https://idp.example.com/logout/saml/response?success=${success}&RelayState=${relayState}`,
      );

      t.mock.module("@/repositories/app-instance.repo", {
        namedExports: {
          getAppInstanceBySlug: t.mock.fn(async () => ({
            id: "app_saml",
            name: "SAML App",
            slug: "saml-app",
            protocol: "SAML",
            teamId: "team_1",
            issuerUrl: null,
            clientId: null,
            clientSecret: null,
            scopes: null,
            customAuthParams: [],
            pkceMode: "S256",
            entryPoint: "https://idp.example.com/sso/saml",
            samlLogoutUrl: "https://idp.example.com/logout/saml",
            issuer: "https://authlab.example.com/sp",
            idpCert: "pem",
            nameIdFormat: null,
            requestedAuthnContext: null,
            forceAuthnDefault: false,
            isPassiveDefault: false,
            samlSignatureAlgorithm: "SHA256",
            clockSkewToleranceSeconds: 0,
            signAuthnRequests: false,
            spSigningPrivateKey: null,
            spSigningCert: null,
            spEncryptionPrivateKey: null,
            spEncryptionCert: null,
            buttonColor: "#3B71CA",
            createdAt: new Date("2026-03-08T00:00:00.000Z"),
            updatedAt: new Date("2026-03-08T00:00:00.000Z"),
          })),
        },
      });
      t.mock.module("@/lib/session", {
        namedExports: {
          getActiveAuthRun: t.mock.fn(async () => ({
            id: "run_saml_1",
            protocol: "SAML",
            claims: {
              nameID: "user@example.com",
              nameIDFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
              sessionIndex: "_session123",
            },
          })),
          clearAppSession,
        },
      });
      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          getAuthRunByLogoutState: t.mock.fn(async () => null),
          markAuthRunLoggedOut,
        },
      });
      t.mock.module("@/lib/saml-handler", {
        namedExports: {
          SAMLHandler: class {
            async handleLogoutRedirect() {
              return {
                kind: "request",
                loggedOut: true,
                profile: {
                  ID: "_logout_request_1",
                  issuer: "https://idp.example.com/metadata",
                  nameID: "user@example.com",
                  nameIDFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
                  sessionIndex: "_session123",
                },
              };
            }

            async buildLogoutResponseUrl(
              callbackUrl: string,
              logoutCallbackUrl: string,
              relayState: string,
              profile: Record<string, unknown>,
              success: boolean,
            ) {
              return buildLogoutResponseUrl(
                callbackUrl,
                relayState,
                {
                  ...profile,
                  logoutCallbackUrl,
                },
                success,
              );
            }
          },
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/logout/saml/[slug]/callback/route.ts")
      >("../../src/app/api/auth/logout/saml/[slug]/callback/route.ts");

      const response = await route.GET(
        new Request(
          "http://localhost/api/auth/logout/saml/saml-app/callback?SAMLRequest=abc&RelayState=idp-state-123",
        ),
        { params: Promise.resolve({ slug: "saml-app" }) },
      );

      assert.equal(response.status, 307);
      assert.equal(
        response.headers.get("location"),
        "https://idp.example.com/logout/saml/response?success=true&RelayState=idp-state-123",
      );
      assert.equal(markAuthRunLoggedOut.mock.callCount(), 1);
      assert.equal(clearAppSession.mock.callCount(), 1);
    });
  });

  describe("MFA TOTP routes", () => {
    it("starts TOTP setup for verified users and persists pending setup in session", async (t) => {
      const user = await createUser({ email: "totp@example.com", isVerified: true });
      const session = { save: t.mock.fn(async () => undefined) } as Record<string, unknown>;

      t.mock.module("@/lib/user-session", {
        namedExports: {
          getCurrentUser: t.mock.fn(async () => ({ userId: user.id })),
          getUserSession: t.mock.fn(async () => session),
        },
      });
      t.mock.module("@/lib/totp", {
        namedExports: {
          createTotpSetup: t.mock.fn(async () => ({
            secret: "manual-secret",
            qrCodeDataUrl: "data:image/png;base64,qr",
            otpauthUrl: "otpauth://totp/AuthLab",
          })),
        },
      });
      t.mock.module("@/lib/encryption", {
        namedExports: {
          encrypt: t.mock.fn(() => "enc-secret"),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/user/mfa/totp/setup/start/route.ts")
      >("../../src/app/api/user/mfa/totp/setup/start/route.ts");

      const response = await route.POST();

      assert.equal(response.status, 200);
      assert.equal(
        (session.pendingTotpSetup as { secretEnc: string }).secretEnc,
        "enc-secret",
      );
      assert.equal(typeof (session.pendingTotpSetup as { expiresAt: number }).expiresAt, "number");
    });

    it("verifies pending TOTP setup and updates the user/session", async (t) => {
      const user = await createUser({ email: "totp-verify@example.com", isVerified: true });
      const session = {
        pendingTotpSetup: {
          secretEnc: "enc-secret",
          expiresAt: Date.now() + 60_000,
        },
        save: t.mock.fn(async () => undefined),
      } as Record<string, unknown>;

      t.mock.module("@/lib/user-session", {
        namedExports: {
          getCurrentUser: t.mock.fn(async () => ({ userId: user.id })),
          getUserSession: t.mock.fn(async () => session),
        },
      });
      t.mock.module("@/lib/encryption", {
        namedExports: { decrypt: t.mock.fn(() => "manual-secret") },
      });
      t.mock.module("@/lib/totp", {
        namedExports: { verifyTotpToken: t.mock.fn(() => true) },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/user/mfa/totp/setup/verify/route.ts")
      >("../../src/app/api/user/mfa/totp/setup/verify/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/user/mfa/totp/setup/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: "123456" }),
        }),
      );

      assert.equal(response.status, 200);
      const prisma = await getPrisma();
      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      assert.equal(updated?.mfaEnabled, true);
      assert.equal(updated?.totpSecretEnc, "enc-secret");
      assert.equal(session.mfaEnabled, true);
      assert.equal("pendingTotpSetup" in session, false);
    });

    it("disables MFA after password and TOTP verification", async (t) => {
      const user = await createUser({
        email: "totp-disable@example.com",
        isVerified: true,
        mfaEnabled: true,
      });
      const prisma = await getPrisma();
      await prisma.user.update({
        where: { id: user.id },
        data: {
          mfaEnabled: true,
          totpSecretEnc: "enc-secret",
          totpEnabledAt: new Date(),
        },
      });
      const session = { mfaEnabled: true, save: t.mock.fn(async () => undefined) };

      t.mock.module("@/lib/user-session", {
        namedExports: {
          getCurrentUser: t.mock.fn(async () => ({ userId: user.id })),
          getUserSession: t.mock.fn(async () => session),
        },
      });
      t.mock.module("@/lib/encryption", {
        namedExports: { decrypt: t.mock.fn(() => "manual-secret") },
      });
      t.mock.module("@/lib/totp", {
        namedExports: { verifyTotpToken: t.mock.fn(() => true) },
      });
      t.mock.module("@/lib/password", {
        namedExports: {
          verifyPasswordAndMaybeUpgrade: t.mock.fn(async () => ({
            valid: true,
            upgradedHash: "upgraded-hash",
          })),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/user/mfa/totp/disable/route.ts")
      >("../../src/app/api/user/mfa/totp/disable/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/user/mfa/totp/disable", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ currentPassword: "Password123!", code: "123456" }),
        }),
      );

      assert.equal(response.status, 200);
      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      assert.equal(updated?.mfaEnabled, false);
      assert.equal(updated?.totpSecretEnc, null);
      assert.equal(updated?.passwordHash, "upgraded-hash");
      assert.equal(session.mfaEnabled, false);
    });
  });

  describe("passkey routes", () => {
    it("creates registration options and stores a register challenge in session", async (t) => {
      const user = await createUser({ email: "passkey-register@example.com", isVerified: true });
      await createCredentialRecord({
        userId: user.id,
        credentialId: "existing-cred",
      });
      const session = { save: t.mock.fn(async () => undefined) } as Record<string, unknown>;

      t.mock.module("@/lib/user-session", {
        namedExports: {
          getCurrentUser: t.mock.fn(async () => ({ userId: user.id })),
          getUserSession: t.mock.fn(async () => session),
        },
      });
      t.mock.module("@/lib/webauthn", {
        namedExports: {
          createPasskeyRegistrationOptions: t.mock.fn(async ({ excludeCredentialIds }) => ({
            challenge: "register-challenge",
            excludeCredentialIds,
          })),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/user/passkeys/register/options/route.ts")
      >("../../src/app/api/user/passkeys/register/options/route.ts");

      const response = await route.POST();
      assert.equal(response.status, 200);
      assert.deepEqual(await getJson(response), {
        challenge: "register-challenge",
        excludeCredentialIds: ["existing-cred"],
      });
      assert.equal((session.webauthnChallenge as { challenge: string }).challenge, "register-challenge");
    });

    it("verifies passkey registration and stores the credential", async (t) => {
      const user = await createUser({ email: "passkey-verify@example.com", isVerified: true });
      const session = {
        webauthnChallenge: {
          challenge: "register-challenge",
          purpose: "REGISTER",
          userId: user.id,
          expiresAt: Date.now() + 60_000,
        },
        save: t.mock.fn(async () => undefined),
      } as Record<string, unknown>;

      t.mock.module("@/lib/user-session", {
        namedExports: {
          getCurrentUser: t.mock.fn(async () => ({ userId: user.id })),
          getUserSession: t.mock.fn(async () => session),
        },
      });
      t.mock.module("@/lib/webauthn", {
        namedExports: {
          verifyPasskeyRegistration: t.mock.fn(async () => ({
            verified: true,
            registrationInfo: {
              credential: {
                id: "cred-1",
                publicKey: Buffer.from("public-key"),
                counter: 9,
              },
            },
          })),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/user/passkeys/register/verify/route.ts")
      >("../../src/app/api/user/passkeys/register/verify/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/user/passkeys/register/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ response: { id: "cred-1" } }),
        }),
      );

      assert.equal(response.status, 200);
      const prisma = await getPrisma();
      const credential = await prisma.credential.findUnique({
        where: { credentialId: "cred-1" },
      });
      assert.ok(credential);
      assert.equal(credential.signCount, 9);
      assert.equal("webauthnChallenge" in session, false);
    });

    it("creates login options and stores a login challenge in session", async (t) => {
      const user = await createUser({ email: "passkey-login@example.com", isVerified: true });
      await createCredentialRecord({ userId: user.id, credentialId: "cred-login" });
      const session = { save: t.mock.fn(async () => undefined) } as Record<string, unknown>;

      t.mock.module("@/lib/user-session", {
        namedExports: {
          getUserSession: t.mock.fn(async () => session),
        },
      });
      t.mock.module("@/lib/webauthn", {
        namedExports: {
          createPasskeyAuthenticationOptions: t.mock.fn(async (credentialIds) => ({
            challenge: "login-challenge",
            credentialIds,
          })),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/user/passkeys/login/options/route.ts")
      >("../../src/app/api/user/passkeys/login/options/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/user/passkeys/login/options", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: user.email }),
        }),
      );

      assert.equal(response.status, 200);
      assert.deepEqual(await getJson(response), {
        challenge: "login-challenge",
        credentialIds: ["cred-login"],
      });
      assert.equal((session.webauthnChallenge as { purpose: string }).purpose, "LOGIN");
    });

    it("verifies passkey login, updates the counter, and authenticates the session", async (t) => {
      const user = await createUser({ email: "passkey-auth@example.com", isVerified: true });
      const team = await createTeam({ slug: "passkey-team" });
      await addTeamMember(team.id, user.id, "OWNER");
      const credential = await createCredentialRecord({
        userId: user.id,
        credentialId: "cred-auth",
        signCount: 4,
      });
      const session = {
        webauthnChallenge: {
          challenge: "login-challenge",
          purpose: "LOGIN",
          expiresAt: Date.now() + 60_000,
        },
        save: t.mock.fn(async () => undefined),
      } as Record<string, unknown>;

      t.mock.module("@/lib/user-session", {
        namedExports: {
          getUserSession: t.mock.fn(async () => session),
          clearAuthState: t.mock.fn((target) => {
            delete target.webauthnChallenge;
            delete target.pendingAuth;
            delete target.pendingTotpSetup;
          }),
          setAuthenticatedUserSession: t.mock.fn((target, authenticatedUser, activeTeamId) => {
            target.userId = authenticatedUser.id;
            target.activeTeamId = activeTeamId;
            delete target.webauthnChallenge;
          }),
        },
      });
      t.mock.module("@/lib/webauthn", {
        namedExports: {
          verifyPasskeyAuthentication: t.mock.fn(async () => ({
            verified: true,
            authenticationInfo: { newCounter: 8 },
          })),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/user/passkeys/login/verify/route.ts")
      >("../../src/app/api/user/passkeys/login/verify/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/user/passkeys/login/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ response: { id: "cred-auth" } }),
        }),
      );

      assert.equal(response.status, 200);
      const prisma = await getPrisma();
      const updated = await prisma.credential.findUnique({ where: { id: credential.id } });
      assert.equal(updated?.signCount, 8);
      assert.equal(session.userId, user.id);
      assert.equal(session.activeTeamId, team.id);
    });

    it("returns MFA required for passkey login when TOTP is enabled", async (t) => {
      const user = await createUser({
        email: "passkey-mfa@example.com",
        isVerified: true,
        mfaEnabled: true,
      });
      const team = await createTeam({ slug: "passkey-mfa-team" });
      await addTeamMember(team.id, user.id, "OWNER");
      await createCredentialRecord({ userId: user.id, credentialId: "cred-mfa" });
      const session = {
        webauthnChallenge: {
          challenge: "login-challenge",
          purpose: "LOGIN",
          expiresAt: Date.now() + 60_000,
        },
        save: t.mock.fn(async () => undefined),
      } as Record<string, unknown>;

      t.mock.module("@/lib/user-session", {
        namedExports: {
          getUserSession: t.mock.fn(async () => session),
          clearAuthState: t.mock.fn((target) => {
            delete target.webauthnChallenge;
          }),
          setAuthenticatedUserSession: t.mock.fn(),
        },
      });
      t.mock.module("@/lib/webauthn", {
        namedExports: {
          verifyPasskeyAuthentication: t.mock.fn(async () => ({
            verified: true,
            authenticationInfo: { newCounter: 3 },
          })),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/user/passkeys/login/verify/route.ts")
      >("../../src/app/api/user/passkeys/login/verify/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/user/passkeys/login/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ response: { id: "cred-mfa" } }),
        }),
      );

      assert.equal(response.status, 200);
      assert.deepEqual(await getJson(response), {
        mfaRequired: true,
        method: "TOTP",
      });
      assert.equal((session.pendingAuth as { userId: string }).userId, user.id);
    });

    it("lists and deletes passkeys for the authenticated user", async (t) => {
      const user = await createUser({ email: "passkey-list@example.com" });
      const credential = await createCredentialRecord({
        userId: user.id,
        credentialId: "cred-list",
      });

      t.mock.module("@/lib/user-session", {
        namedExports: {
          getCurrentUser: t.mock.fn(async () => ({ userId: user.id })),
        },
      });

      const listRoute = await importFresh<
        typeof import("../../src/app/api/user/passkeys/route.ts")
      >("../../src/app/api/user/passkeys/route.ts");
      const listResponse = await listRoute.GET();
      assert.equal(listResponse.status, 200);
      const listJson = await getJson(listResponse) as { credentials: Array<{ credentialId: string }> };
      assert.equal(listJson.credentials[0]?.credentialId, "cred-list");

      const deleteRoute = await importFresh<
        typeof import("../../src/app/api/user/passkeys/[id]/route.ts")
      >("../../src/app/api/user/passkeys/[id]/route.ts");
      const deleteResponse = await deleteRoute.DELETE(
        new Request("http://localhost/api/user/passkeys/cred-list", {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: credential.id }) },
      );
      assert.equal(deleteResponse.status, 200);

      const prisma = await getPrisma();
      assert.equal(await prisma.credential.findUnique({ where: { id: credential.id } }), null);
    });
  });

  describe("password reset routes", () => {
    it("requests password reset for verified users and creates a reset token", async (t) => {
      const user = await createUser({ email: "reset@example.com", isVerified: true });
      const sentEmails: Array<{ email: string; token: string }> = [];

      t.mock.module("@/lib/auth-email", {
        namedExports: {
          sendPasswordResetLink: t.mock.fn(async (payload) => {
            sentEmails.push(payload);
          }),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/user/password-reset/request/route.ts")
      >("../../src/app/api/user/password-reset/request/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/user/password-reset/request", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: user.email }),
        }),
      );

      assert.equal(response.status, 200);
      const prisma = await getPrisma();
      const token = await prisma.authToken.findFirst({
        where: { userId: user.id, purpose: "PASSWORD_RESET" },
      });
      assert.ok(token);
      assert.equal(hashToken(sentEmails[0]?.token ?? ""), token.tokenHash);
    });

    it("completes password reset with MFA validation for MFA-enabled users", async (t) => {
      const user = await createUser({ email: "reset-complete@example.com", mfaEnabled: true });
      const prisma = await getPrisma();
      await prisma.user.update({
        where: { id: user.id },
        data: {
          mfaEnabled: true,
          totpSecretEnc: "enc-secret",
          totpEnabledAt: new Date(),
        },
      });
      await createAuthTokenRecord({
        userId: user.id,
        token: "reset-token",
        purpose: "PASSWORD_RESET",
        expiresAt: new Date(Date.now() + 60_000),
      });

      t.mock.module("@/lib/encryption", {
        namedExports: { decrypt: t.mock.fn(() => "manual-secret") },
      });
      t.mock.module("@/lib/totp", {
        namedExports: { verifyTotpToken: t.mock.fn(() => true) },
      });
      t.mock.module("@/lib/password", {
        namedExports: { hashPassword: t.mock.fn(async () => "new-hash") },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/user/password-reset/complete/route.ts")
      >("../../src/app/api/user/password-reset/complete/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/user/password-reset/complete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token: "reset-token",
            newPassword: "StrongPassword123!",
            totpCode: "123456",
          }),
        }),
      );

      assert.equal(response.status, 200);
      const updated = await prisma.user.findUnique({ where: { id: user.id } });
      assert.equal(updated?.passwordHash, "new-hash");
      assert.equal(updated?.mustChangePassword, false);
    });
  });

  describe("admin routes", () => {
    it("returns stats for system admins", async (t) => {
      const admin = await createUser({ email: "admin-stats@example.com", isSystemAdmin: true });
      const team = await createTeam({ slug: "stats-team" });
      await addTeamMember(team.id, admin.id, "OWNER");
      const prisma = await getPrisma();
      await prisma.appInstance.create({
        data: {
          name: "Stats App",
          slug: "stats-app",
          protocol: "OIDC",
          teamId: team.id,
          issuerUrl: "https://issuer.example.com",
          clientId: "client-id",
        },
      });

      t.mock.module("@/lib/user-session", {
        namedExports: {
          getCurrentUser: t.mock.fn(async () => ({
            userId: admin.id,
            isSystemAdmin: true,
          })),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/admin/stats/route.ts")
      >("../../src/app/api/admin/stats/route.ts");

      const response = await route.GET();
      assert.equal(response.status, 200);
      assert.deepEqual(await getJson(response), {
        totalUsers: 1,
        totalTeams: 1,
        totalApps: 1,
      });
    });

    it("creates admin-managed users with deduped team memberships", async (t) => {
      const admin = await createUser({ email: "admin-create@example.com", isSystemAdmin: true });
      const team = await createTeam({ slug: "managed-team" });

      t.mock.module("@/lib/user-session", {
        namedExports: {
          getCurrentUser: t.mock.fn(async () => ({
            userId: admin.id,
            isSystemAdmin: true,
          })),
        },
      });
      t.mock.module("@/lib/password", {
        namedExports: { hashPassword: t.mock.fn(async () => "temp-hash") },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/admin/users/route.ts")
      >("../../src/app/api/admin/users/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/admin/users", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: "new-admin-user@example.com",
            name: "Managed User",
            tempPassword: "TemporaryPass123!",
            memberships: [
              { teamId: team.id, role: "ADMIN" },
              { teamId: team.id, role: "MEMBER" },
            ],
          }),
        }),
      );

      assert.equal(response.status, 201);
      const prisma = await getPrisma();
      const created = await prisma.user.findUnique({
        where: { email: "new-admin-user@example.com" },
      });
      assert.ok(created);
      const memberships = await prisma.teamMember.findMany({
        where: { userId: created.id },
      });
      assert.equal(memberships.length, 2);
      assert.ok(memberships.some((membership) => membership.role === "OWNER"));
      assert.ok(
        memberships.some(
          (membership) => membership.teamId === team.id && membership.role === "MEMBER",
        ),
      );
    });

    it("protects admin self-demotion and last-admin deletion", async (t) => {
      const admin = await createUser({ email: "admin-guard@example.com", isSystemAdmin: true });

      t.mock.module("@/lib/user-session", {
        namedExports: {
          getCurrentUser: t.mock.fn(async () => ({
            userId: admin.id,
            isSystemAdmin: true,
          })),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/admin/users/[id]/route.ts")
      >("../../src/app/api/admin/users/[id]/route.ts");

      const demoteResponse = await route.PUT(
        new Request(`http://localhost/api/admin/users/${admin.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ isSystemAdmin: false }),
        }),
        { params: Promise.resolve({ id: admin.id }) },
      );
      assert.equal(demoteResponse.status, 400);

      const deleteResponse = await route.DELETE(
        new Request(`http://localhost/api/admin/users/${admin.id}`, {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: admin.id }) },
      );
      assert.equal(deleteResponse.status, 400);
    });

    it("saves admin email-provider config through the route", async (t) => {
      const admin = await createUser({ email: "admin-email@example.com", isSystemAdmin: true });
      const saveEmailProviderConfig = t.mock.fn(async () => undefined);

      t.mock.module("@/lib/user-session", {
        namedExports: {
          getCurrentUser: t.mock.fn(async () => ({
            userId: admin.id,
            isSystemAdmin: true,
          })),
        },
      });
      t.mock.module("@/lib/email-provider", {
        namedExports: {
          getMaskedEmailProviderConfig: t.mock.fn(async () => ({
            activeProvider: "SMTP",
          })),
          saveEmailProviderConfig,
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/admin/email-provider/route.ts")
      >("../../src/app/api/admin/email-provider/route.ts");

      const response = await route.PUT(
        new Request("http://localhost/api/admin/email-provider", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            activeProvider: "SMTP",
            smtp: {
              host: "smtp.example.com",
              port: 587,
              secure: false,
              username: "mailer",
              password: "secret",
              fromName: "AuthLab",
              fromEmail: "noreply@example.com",
            },
          }),
        }),
      );

      assert.equal(response.status, 200);
      assert.equal(saveEmailProviderConfig.mock.calls.length, 1);
    });
  });

  describe("saml signing material route", () => {
    it("generates a self-signed test keypair for authenticated users", async (t) => {
      const user = await createUser({ email: "saml-signer@example.com" });

      t.mock.module("@/lib/user-session", {
        namedExports: {
          getCurrentUser: t.mock.fn(async () => ({
            userId: user.id,
            activeTeamId: "team_test",
          })),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/saml/signing-material/route.ts")
      >("../../src/app/api/saml/signing-material/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/saml/signing-material", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "SAML Test App",
            slug: "saml-test-app",
            usage: "encryption",
          }),
        }),
      );

      assert.equal(response.status, 201);
      const payload = await getJson(response) as {
        privateKeyPem: string;
        certificatePem: string;
        info: {
          usage: string;
          subject: string;
          fingerprint256: string;
          validTo: string;
        };
      };

      assert.match(payload.privateKeyPem, /BEGIN PRIVATE KEY/);
      assert.match(payload.certificatePem, /BEGIN CERTIFICATE/);
      assert.equal(payload.info.usage, "encryption");
      assert.match(payload.info.subject, /AuthLab saml-test-app/i);
      assert.match(payload.info.fingerprint256, /^([A-F0-9]{2}:){31}[A-F0-9]{2}$/);
      assert.ok(Number.isFinite(Date.parse(payload.info.validTo)));
    });
  });

  describe("OIDC phase 1 routes", () => {
    it("fetches and persists UserInfo for an active OIDC run", async (t) => {
      t.mock.module("@/repositories/app-instance.repo", {
        namedExports: {
          getAppInstanceBySlug: t.mock.fn(async () => ({
            id: "app_oidc",
            name: "OIDC App",
            slug: "oidc-app",
            protocol: "OIDC",
            teamId: "team_1",
            issuerUrl: "https://issuer.example.com",
            clientId: "client-123",
            clientSecret: "secret-123",
            scopes: "openid profile email",
            customAuthParams: [],
            entryPoint: null,
            issuer: null,
            idpCert: null,
            nameIdFormat: null,
            forceAuthnDefault: false,
            isPassiveDefault: false,
            signAuthnRequests: false,
            spSigningPrivateKey: null,
            spSigningCert: null,
            buttonColor: "#3B71CA",
            createdAt: new Date("2026-03-07T00:00:00.000Z"),
            updatedAt: new Date("2026-03-07T00:00:00.000Z"),
          })),
        },
      });
      t.mock.module("@/lib/session", {
        namedExports: {
          getActiveAuthRun: t.mock.fn(async () => ({
            id: "run_1",
            appInstanceId: "app_oidc",
            protocol: "OIDC",
            status: "AUTHENTICATED",
            loginState: null,
            nonce: "nonce-1",
            nonceStatus: "valid",
            runtimeOverrides: {},
            outboundAuthParams: {},
            claims: { sub: "user-123" },
            idToken: "id-token",
            accessToken: "access-token",
            rawTokenResponse: null,
            rawSamlResponseXml: null,
            userinfo: null,
            authenticatedAt: new Date("2026-03-07T12:00:00.000Z"),
            completedAt: null,
            logoutState: null,
            logoutCompletedAt: null,
            createdAt: new Date("2026-03-07T12:00:00.000Z"),
            updatedAt: new Date("2026-03-07T12:00:00.000Z"),
          })),
        },
      });
      t.mock.module("@/lib/oidc-handler", {
        namedExports: {
          OIDCHandler: class {
            async fetchUserInfo() {
              return { sub: "user-123", email: "user@example.com" };
            }
          },
        },
      });
      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          createAuthRunEvent: t.mock.fn(async () => undefined),
          updateAuthRunUserInfo: t.mock.fn(async (_id: string, userinfo: Record<string, unknown>) => ({
            userinfo,
          })),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/userinfo/[slug]/route.ts")
      >("../../src/app/api/auth/userinfo/[slug]/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/auth/userinfo/oidc-app", {
          method: "POST",
        }),
        { params: Promise.resolve({ slug: "oidc-app" }) },
      );

      assert.equal(response.status, 200);
      const payload = await getJson(response) as { userinfo: { email: string } };
      assert.equal(payload.userinfo.email, "user@example.com");
    });

    it("starts RP-initiated logout and redirects to the provider", async (t) => {
      const setAuthRunLogoutState = t.mock.fn(async () => undefined);

      t.mock.module("openid-client", {
        namedExports: {
          randomState: t.mock.fn(() => "logout-state-123"),
        },
      });
      t.mock.module("@/repositories/app-instance.repo", {
        namedExports: {
          getAppInstanceBySlug: t.mock.fn(async () => ({
            id: "app_oidc",
            name: "OIDC App",
            slug: "oidc-app",
            protocol: "OIDC",
            teamId: "team_1",
            issuerUrl: "https://issuer.example.com",
            clientId: "client-123",
            clientSecret: "secret-123",
            scopes: "openid profile email",
            customAuthParams: [],
            pkceMode: "S256",
            entryPoint: null,
            issuer: null,
            idpCert: null,
            nameIdFormat: null,
            forceAuthnDefault: false,
            isPassiveDefault: false,
            signAuthnRequests: false,
            spSigningPrivateKey: null,
            spSigningCert: null,
            buttonColor: "#3B71CA",
            createdAt: new Date("2026-03-07T00:00:00.000Z"),
            updatedAt: new Date("2026-03-07T00:00:00.000Z"),
          })),
        },
      });
      t.mock.module("@/lib/session", {
        namedExports: {
          getActiveAuthRun: t.mock.fn(async () => ({
            id: "run_1",
            idToken: "id-token",
          })),
        },
      });
      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          setAuthRunLogoutState,
        },
      });
      t.mock.module("@/lib/oidc-handler", {
        namedExports: {
          OIDCHandler: class {
            async buildLogoutUrl() {
              return "https://issuer.example.com/logout?state=logout-state-123";
            }
          },
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/logout/oidc/[slug]/route.ts")
      >("../../src/app/api/auth/logout/oidc/[slug]/route.ts");

      const response = await route.GET(
        new Request("http://localhost/api/auth/logout/oidc/oidc-app"),
        { params: Promise.resolve({ slug: "oidc-app" }) },
      );

      assert.equal(response.status, 307);
      assert.equal(
        response.headers.get("location"),
        "https://issuer.example.com/logout?state=logout-state-123",
      );
      assert.equal(setAuthRunLogoutState.mock.callCount(), 1);
    });

    it("completes RP-initiated logout when callback state matches", async (t) => {
      const markAuthRunLoggedOut = t.mock.fn(async () => undefined);
      const clearAppSession = t.mock.fn(async () => undefined);

      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          getAuthRunByLogoutState: t.mock.fn(async () => ({ id: "run_1" })),
          markAuthRunLoggedOut,
        },
      });
      t.mock.module("@/lib/session", {
        namedExports: {
          clearAppSession,
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/logout/oidc/[slug]/callback/route.ts")
      >("../../src/app/api/auth/logout/oidc/[slug]/callback/route.ts");

      const response = await route.GET(
        new Request(
          "http://localhost/api/auth/logout/oidc/oidc-app/callback?state=logout-state-123",
        ),
        { params: Promise.resolve({ slug: "oidc-app" }) },
      );

      assert.equal(response.status, 307);
      assert.equal(response.headers.get("location"), "http://localhost:3000/test/oidc-app");
      assert.equal(markAuthRunLoggedOut.mock.callCount(), 1);
      assert.equal(clearAppSession.mock.callCount(), 1);
    });

    it("rejects RP-initiated logout callbacks without a valid state", async (t) => {
      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          getAuthRunByLogoutState: t.mock.fn(async () => null),
          markAuthRunLoggedOut: t.mock.fn(async () => undefined),
        },
      });
      t.mock.module("@/lib/session", {
        namedExports: {
          clearAppSession: t.mock.fn(async () => undefined),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/logout/oidc/[slug]/callback/route.ts")
      >("../../src/app/api/auth/logout/oidc/[slug]/callback/route.ts");

      const response = await route.GET(
        new Request(
          "http://localhost/api/auth/logout/oidc/oidc-app/callback?state=bad-state",
        ),
        { params: Promise.resolve({ slug: "oidc-app" }) },
      );

      assert.equal(response.status, 400);
      const payload = await getJson(response) as { error: string };
      assert.equal(payload.error, "Invalid logout state");
    });
  });

  describe("OIDC phase 2 routes", () => {
    it("issues client credentials tokens and saves the auth run session", async (t) => {
      const saveAuthResultSession = t.mock.fn(async () => undefined);
      const session = { save: t.mock.fn(async () => undefined) };

      t.mock.module("@/repositories/app-instance.repo", {
        namedExports: {
          getAppInstanceBySlug: t.mock.fn(async () => ({
            id: "app_oidc",
            name: "OIDC App",
            slug: "oidc-app",
            protocol: "OIDC",
            teamId: "team_1",
            issuerUrl: "https://issuer.example.com",
            clientId: "client-123",
            clientSecret: "secret-123",
            scopes: "openid profile email",
            customAuthParams: [],
            pkceMode: "S256",
            entryPoint: null,
            issuer: null,
            idpCert: null,
            nameIdFormat: null,
            forceAuthnDefault: false,
            isPassiveDefault: false,
            signAuthnRequests: false,
            spSigningPrivateKey: null,
            spSigningCert: null,
            buttonColor: "#3B71CA",
            createdAt: new Date("2026-03-07T00:00:00.000Z"),
            updatedAt: new Date("2026-03-07T00:00:00.000Z"),
          })),
        },
      });
      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          createAuthRun: t.mock.fn(async () => ({ id: "run_cc" })),
          completeAuthRun: t.mock.fn(async () => ({
            id: "run_cc",
            authenticatedAt: new Date("2026-03-07T12:00:00.000Z"),
          })),
          createAuthRunEvent: t.mock.fn(async () => undefined),
        },
      });
      t.mock.module("@/lib/session", {
        namedExports: {
          getAppSession: t.mock.fn(async () => session),
          saveAuthResultSession,
        },
      });
      t.mock.module("@/lib/oidc-handler", {
        namedExports: {
          OIDCHandler: class {
            async exchangeClientCredentials(scopes?: string) {
              return {
                claims: {},
                rawTokenResponse: JSON.stringify({ access_token: "cc-token", scope: scopes }),
                idToken: null,
                accessToken: "cc-token",
                refreshToken: null,
                accessTokenExpiresAt: new Date("2026-03-07T13:00:00.000Z"),
              };
            }
          },
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/token/client-credentials/[slug]/route.ts")
      >("../../src/app/api/auth/token/client-credentials/[slug]/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/auth/token/client-credentials/oidc-app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scopes: "api.read api.write" }),
        }),
        { params: Promise.resolve({ slug: "oidc-app" }) },
      );

      assert.equal(response.status, 200);
      assert.deepEqual(saveAuthResultSession.mock.calls.at(0)?.arguments.at(1), {
        runId: "run_cc",
        slug: "oidc-app",
        protocol: "OIDC",
        authenticatedAt: "2026-03-07T12:00:00.000Z",
      });
    });

    it("refreshes tokens for the active OIDC run", async (t) => {
      t.mock.module("@/repositories/app-instance.repo", {
        namedExports: {
          getAppInstanceBySlug: t.mock.fn(async () => ({ id: "app_oidc", slug: "oidc-app", protocol: "OIDC" })),
        },
      });
      t.mock.module("@/lib/session", {
        namedExports: {
          getActiveAuthRun: t.mock.fn(async () => ({
            id: "run_1",
            refreshToken: "refresh-token",
          })),
        },
      });
      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          completeAuthRun: t.mock.fn(async () => ({ id: "run_1" })),
          createAuthRunEvent: t.mock.fn(async () => undefined),
        },
      });
      t.mock.module("@/lib/oidc-handler", {
        namedExports: {
          OIDCHandler: class {
            async refreshTokens() {
              return {
                claims: { sub: "user-123" },
                rawTokenResponse: JSON.stringify({ access_token: "new-access" }),
                idToken: "new-id",
                accessToken: "new-access",
                refreshToken: "new-refresh",
                accessTokenExpiresAt: new Date("2026-03-07T13:00:00.000Z"),
              };
            }
          },
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/token/refresh/[slug]/route.ts")
      >("../../src/app/api/auth/token/refresh/[slug]/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/auth/token/refresh/oidc-app", {
          method: "POST",
        }),
        { params: Promise.resolve({ slug: "oidc-app" }) },
      );

      assert.equal(response.status, 200);
    });

    it("stores token introspection results on the active run", async (t) => {
      t.mock.module("@/repositories/app-instance.repo", {
        namedExports: {
          getAppInstanceBySlug: t.mock.fn(async () => ({ id: "app_oidc", slug: "oidc-app", protocol: "OIDC" })),
        },
      });
      t.mock.module("@/lib/session", {
        namedExports: {
          getActiveAuthRun: t.mock.fn(async () => ({
            id: "run_1",
            accessToken: "access-token",
            refreshToken: "refresh-token",
          })),
        },
      });
      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          completeAuthRun: t.mock.fn(async () => ({ lastIntrospection: { active: true } })),
          createAuthRunEvent: t.mock.fn(async () => undefined),
        },
      });
      t.mock.module("@/lib/oidc-handler", {
        namedExports: {
          OIDCHandler: class {
            async introspectToken() {
              return { active: true, scope: "openid profile email" };
            }
          },
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/token/introspect/[slug]/route.ts")
      >("../../src/app/api/auth/token/introspect/[slug]/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/auth/token/introspect/oidc-app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: "access_token" }),
        }),
        { params: Promise.resolve({ slug: "oidc-app" }) },
      );

      assert.equal(response.status, 200);
      const payload = await getJson(response) as { introspection: { active: boolean } };
      assert.equal(payload.introspection.active, true);
    });

    it("records token revocation for the active run", async (t) => {
      t.mock.module("@/repositories/app-instance.repo", {
        namedExports: {
          getAppInstanceBySlug: t.mock.fn(async () => ({ id: "app_oidc", slug: "oidc-app", protocol: "OIDC" })),
        },
      });
      t.mock.module("@/lib/session", {
        namedExports: {
          getActiveAuthRun: t.mock.fn(async () => ({
            id: "run_1",
            accessToken: "access-token",
            refreshToken: "refresh-token",
          })),
        },
      });
      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          completeAuthRun: t.mock.fn(async () => ({
            lastRevocationAt: new Date("2026-03-07T12:30:00.000Z"),
          })),
          createAuthRunEvent: t.mock.fn(async () => undefined),
        },
      });
      t.mock.module("@/lib/oidc-handler", {
        namedExports: {
          OIDCHandler: class {
            async revokeToken() {
              return undefined;
            }
          },
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/token/revoke/[slug]/route.ts")
      >("../../src/app/api/auth/token/revoke/[slug]/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/auth/token/revoke/oidc-app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: "refresh_token" }),
        }),
        { params: Promise.resolve({ slug: "oidc-app" }) },
      );

      assert.equal(response.status, 200);
      const payload = await getJson(response) as { revoked: boolean };
      assert.equal(payload.revoked, true);
    });
  });

  describe("OIDC phase 4 routes", () => {
    it("accepts a valid back-channel logout token and logs out matching runs", async (t) => {
      const markAuthRunsLoggedOut = t.mock.fn(async () => 1);
      const createAuthRunEvent = t.mock.fn(async () => undefined);

      t.mock.module("@/repositories/app-instance.repo", {
        namedExports: {
          getAppInstanceBySlug: t.mock.fn(async () => ({
            id: "app_oidc",
            slug: "oidc-app",
            protocol: "OIDC",
            clientId: "client-123",
          })),
        },
      });
      t.mock.module("@/lib/oidc-backchannel-logout", {
        namedExports: {
          validateOidcBackchannelLogoutToken: t.mock.fn(async () => ({
            subject: "user-123",
            sessionId: "sid-123",
            jwtId: "jti-123",
            issuedAt: 1_762_401_600,
            algorithm: "RS256",
          })),
        },
      });
      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          listBackchannelLogoutCandidates: t.mock.fn(async () => [
            { id: "run_1" },
          ]),
          markAuthRunsLoggedOut,
          createAuthRunEvent,
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/backchannel-logout/[slug]/route.ts")
      >("../../src/app/api/auth/backchannel-logout/[slug]/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/auth/backchannel-logout/oidc-app", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            logout_token: "logout.jwt.token",
          }).toString(),
        }),
        { params: Promise.resolve({ slug: "oidc-app" }) },
      );

      assert.equal(response.status, 200);
      const payload = await getJson(response) as { acknowledged: boolean; matchedRuns: number };
      assert.equal(payload.acknowledged, true);
      assert.equal(payload.matchedRuns, 1);
      assert.deepEqual(markAuthRunsLoggedOut.mock.calls.at(0)?.arguments.at(0), ["run_1"]);
      assert.equal(createAuthRunEvent.mock.callCount(), 1);
    });

    it("rejects back-channel logout requests without a logout token", async (t) => {
      t.mock.module("@/repositories/app-instance.repo", {
        namedExports: {
          getAppInstanceBySlug: t.mock.fn(async () => ({
            id: "app_oidc",
            slug: "oidc-app",
            protocol: "OIDC",
            clientId: "client-123",
          })),
        },
      });
      t.mock.module("@/lib/oidc-backchannel-logout", {
        namedExports: {
          validateOidcBackchannelLogoutToken: t.mock.fn(async () => ({
            subject: "user-123",
            sessionId: "sid-123",
          })),
        },
      });
      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          listBackchannelLogoutCandidates: t.mock.fn(async () => []),
          markAuthRunsLoggedOut: t.mock.fn(async () => 0),
          createAuthRunEvent: t.mock.fn(async () => undefined),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/backchannel-logout/[slug]/route.ts")
      >("../../src/app/api/auth/backchannel-logout/[slug]/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/auth/backchannel-logout/oidc-app", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }),
        { params: Promise.resolve({ slug: "oidc-app" }) },
      );

      assert.equal(response.status, 400);
      const payload = await getJson(response) as { error: string };
      assert.equal(payload.error, "Missing logout_token");
    });

    it("starts a device authorization run and saves the pending session", async (t) => {
      const saveAuthResultSession = t.mock.fn(async () => undefined);
      const session = { save: t.mock.fn(async () => undefined) };

      t.mock.module("@/repositories/app-instance.repo", {
        namedExports: {
          getAppInstanceBySlug: t.mock.fn(async () => ({
            id: "app_oidc",
            slug: "oidc-app",
            protocol: "OIDC",
          })),
        },
      });
      t.mock.module("@/lib/session", {
        namedExports: {
          getAppSession: t.mock.fn(async () => session),
          saveAuthResultSession,
        },
      });
      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          createAuthRun: t.mock.fn(async () => ({
            id: "run_device_1",
            createdAt: new Date("2026-03-08T12:00:00.000Z"),
          })),
          createAuthRunEvent: t.mock.fn(async () => undefined),
        },
      });
      t.mock.module("@/lib/oidc-handler", {
        namedExports: {
          OIDCHandler: class {
            async initiateDeviceAuthorization() {
              return {
                deviceCode: "device-code-123",
                userCode: "ABCD-EFGH",
                verificationUri: "https://issuer.example.com/activate",
                verificationUriComplete:
                  "https://issuer.example.com/activate?user_code=ABCD-EFGH",
                expiresIn: 900,
                interval: 5,
                rawResponse: JSON.stringify({ device_code: "device-code-123" }),
              };
            }
          },
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/device/[slug]/route.ts")
      >("../../src/app/api/auth/device/[slug]/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/auth/device/oidc-app", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scopes: "openid offline_access" }),
        }),
        { params: Promise.resolve({ slug: "oidc-app" }) },
      );

      assert.equal(response.status, 200);
      const payload = await getJson(response) as { redirectTo: string };
      assert.equal(payload.redirectTo, "http://localhost:3000/test/oidc-app/inspector");
      assert.deepEqual(saveAuthResultSession.mock.calls.at(0)?.arguments.at(1), {
        runId: "run_device_1",
        slug: "oidc-app",
        protocol: "OIDC",
        authenticatedAt: "2026-03-08T12:00:00.000Z",
      });
    });

    it("returns 202 while a device authorization run is still pending", async (t) => {
      t.mock.module("@/repositories/app-instance.repo", {
        namedExports: {
          getAppInstanceBySlug: t.mock.fn(async () => ({
            id: "app_oidc",
            slug: "oidc-app",
            protocol: "OIDC",
          })),
        },
      });
      t.mock.module("@/lib/session", {
        namedExports: {
          getActiveAuthRun: t.mock.fn(async () => ({
            id: "run_device_1",
            grantType: "DEVICE_AUTHORIZATION",
            status: "PENDING",
          })),
        },
      });
      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          listAuthRunEvents: t.mock.fn(async () => [
            {
              id: "event_device_1",
              type: "DEVICE_AUTHORIZATION_STARTED",
              metadata: {
                deviceCode: "device-code-123",
                userCode: "ABCD-EFGH",
                verificationUri: "https://issuer.example.com/activate",
                expiresIn: 900,
                interval: 5,
              },
            },
          ]),
          completeAuthRun: t.mock.fn(async () => ({ id: "run_device_1" })),
          createAuthRunEvent: t.mock.fn(async () => undefined),
          markAuthRunFailed: t.mock.fn(async () => undefined),
        },
      });
      t.mock.module("@/lib/oidc-handler", {
        namedExports: {
          OIDCHandler: class {
            async pollDeviceAuthorization() {
              return {
                status: "pending",
                error: "Waiting for user approval",
                interval: 5,
              };
            }
          },
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/device/[slug]/poll/route.ts")
      >("../../src/app/api/auth/device/[slug]/poll/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/auth/device/oidc-app/poll", {
          method: "POST",
        }),
        { params: Promise.resolve({ slug: "oidc-app" }) },
      );

      assert.equal(response.status, 202);
      const payload = await getJson(response) as {
        pending: boolean;
        pollAfterSeconds: number;
      };
      assert.equal(payload.pending, true);
      assert.equal(payload.pollAfterSeconds, 5);
    });

    it("completes a device authorization run when the provider returns tokens", async (t) => {
      const completeAuthRun = t.mock.fn(async () => ({ id: "run_device_1" }));
      const createAuthRunEvent = t.mock.fn(async () => undefined);

      t.mock.module("@/repositories/app-instance.repo", {
        namedExports: {
          getAppInstanceBySlug: t.mock.fn(async () => ({
            id: "app_oidc",
            slug: "oidc-app",
            protocol: "OIDC",
          })),
        },
      });
      t.mock.module("@/lib/session", {
        namedExports: {
          getActiveAuthRun: t.mock.fn(async () => ({
            id: "run_device_1",
            grantType: "DEVICE_AUTHORIZATION",
            status: "PENDING",
          })),
        },
      });
      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          listAuthRunEvents: t.mock.fn(async () => [
            {
              id: "event_device_1",
              type: "DEVICE_AUTHORIZATION_STARTED",
              metadata: {
                deviceCode: "device-code-123",
                userCode: "ABCD-EFGH",
                verificationUri: "https://issuer.example.com/activate",
                expiresIn: 900,
                interval: 5,
              },
            },
          ]),
          completeAuthRun,
          createAuthRunEvent,
          markAuthRunFailed: t.mock.fn(async () => undefined),
        },
      });
      t.mock.module("@/lib/oidc-handler", {
        namedExports: {
          OIDCHandler: class {
            async pollDeviceAuthorization() {
              return {
                status: "authorized",
                result: {
                  claims: { sub: "user-123", sid: "sid-123" },
                  rawTokenResponse: JSON.stringify({ access_token: "device-access" }),
                  idToken: "id-token",
                  accessToken: "device-access",
                  refreshToken: "device-refresh",
                  accessTokenExpiresAt: new Date("2026-03-08T13:00:00.000Z"),
                },
              };
            }
          },
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/device/[slug]/poll/route.ts")
      >("../../src/app/api/auth/device/[slug]/poll/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/auth/device/oidc-app/poll", {
          method: "POST",
        }),
        { params: Promise.resolve({ slug: "oidc-app" }) },
      );

      assert.equal(response.status, 200);
      assert.equal(completeAuthRun.mock.callCount(), 1);
      assert.equal(createAuthRunEvent.mock.callCount(), 1);
    });

    it("creates a new run for token exchange and switches the active session", async (t) => {
      const createAuthRun = t.mock.fn(async () => ({
        id: "run_exchange_1",
      }));
      const completeAuthRun = t.mock.fn(async () => ({
        id: "run_exchange_1",
        authenticatedAt: new Date("2026-03-08T13:00:00.000Z"),
      }));
      const createAuthRunEvent = t.mock.fn(async () => undefined);
      const saveAuthResultSession = t.mock.fn(async () => undefined);

      t.mock.module("@/repositories/app-instance.repo", {
        namedExports: {
          getAppInstanceBySlug: t.mock.fn(async () => ({
            id: "app_oidc",
            slug: "oidc-app",
            protocol: "OIDC",
          })),
        },
      });
      t.mock.module("@/lib/session", {
        namedExports: {
          getActiveAuthRun: t.mock.fn(async () => ({
            id: "run_browser_1",
            accessToken: "source-access-token",
            idToken: "source-id-token",
            oidcSubject: "user-123",
            oidcSessionId: "sid-123",
          })),
          getAppSession: t.mock.fn(async () => ({ save: t.mock.fn(async () => undefined) })),
          saveAuthResultSession,
        },
      });
      t.mock.module("@/repositories/auth-run.repo", {
        namedExports: {
          createAuthRun,
          completeAuthRun,
          createAuthRunEvent,
          markAuthRunFailed: t.mock.fn(async () => undefined),
        },
      });
      t.mock.module("@/lib/oidc-handler", {
        namedExports: {
          OIDCHandler: class {
            async exchangeToken() {
              return {
                claims: { sub: "user-123", sid: "sid-999" },
                rawTokenResponse: JSON.stringify({ access_token: "delegated-access" }),
                accessToken: "delegated-access",
                accessTokenExpiresAt: new Date("2026-03-08T14:00:00.000Z"),
                grantType: "TOKEN_EXCHANGE",
              };
            }
          },
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/auth/token/exchange/[slug]/route.ts")
      >("../../src/app/api/auth/token/exchange/[slug]/route.ts");

      const response = await route.POST(
        new Request("http://localhost/api/auth/token/exchange/oidc-app", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            subjectTokenSource: "access_token",
            requestedTokenType: "urn:ietf:params:oauth:token-type:access_token",
            audience: "api://orders",
            scope: "orders.read",
          }),
        }),
        { params: Promise.resolve({ slug: "oidc-app" }) },
      );

      assert.equal(response.status, 200);
      const payload = (await getJson(response)) as { redirectTo: string };
      assert.equal(payload.redirectTo, "http://localhost:3000/test/oidc-app/inspector");
      assert.equal(createAuthRun.mock.callCount(), 1);
      assert.equal(completeAuthRun.mock.callCount(), 1);
      assert.equal(createAuthRunEvent.mock.callCount(), 1);
      assert.deepEqual(saveAuthResultSession.mock.calls.at(0)?.arguments.at(1), {
        runId: "run_exchange_1",
        slug: "oidc-app",
        protocol: "OIDC",
        authenticatedAt: "2026-03-08T13:00:00.000Z",
      });
    });
  });

  describe("SCIM mock routes", () => {
    it("returns service provider capabilities for authorized requests", async () => {
      const prisma = await getPrisma();
      const team = await createTeam();
      const app = await prisma.appInstance.create({
        data: {
          name: "SCIM App",
          slug: "scim-app",
          protocol: "OIDC",
          teamId: team.id,
          issuerUrl: "https://issuer.example.com",
          clientId: "client-123",
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/scim/[slug]/ServiceProviderConfig/route.ts")
      >("../../src/app/api/scim/[slug]/ServiceProviderConfig/route.ts");

      const response = await route.GET(
        new Request("http://localhost/api/scim/scim-app/ServiceProviderConfig", {
          headers: {
            authorization: `Bearer ${deriveScimBearerToken(app.id)}`,
          },
        }),
        { params: Promise.resolve({ slug: "scim-app" }) },
      );

      assert.equal(response.status, 200);
      const payload = (await getJson(response)) as { patch?: { supported?: boolean } };
      assert.equal(payload.patch?.supported, true);
    });

    it("creates, filters, patches, and deletes SCIM users while logging requests", async () => {
      const prisma = await getPrisma();
      const team = await createTeam();
      const app = await prisma.appInstance.create({
        data: {
          name: "SCIM CRUD App",
          slug: "scim-crud-app",
          protocol: "OIDC",
          teamId: team.id,
          issuerUrl: "https://issuer.example.com",
          clientId: "client-123",
        },
      });
      const authHeader = {
        authorization: `Bearer ${deriveScimBearerToken(app.id)}`,
        "content-type": "application/json",
      };

      const usersRoute = await importFresh<
        typeof import("../../src/app/api/scim/[slug]/Users/route.ts")
      >("../../src/app/api/scim/[slug]/Users/route.ts");
      const userItemRoute = await importFresh<
        typeof import("../../src/app/api/scim/[slug]/Users/[resourceId]/route.ts")
      >("../../src/app/api/scim/[slug]/Users/[resourceId]/route.ts");

      const createResponse = await usersRoute.POST(
        new Request("http://localhost/api/scim/scim-crud-app/Users", {
          method: "POST",
          headers: authHeader,
          body: JSON.stringify({
            userName: "baseline@example.com",
            active: true,
            externalId: "ext-123",
          }),
        }),
        { params: Promise.resolve({ slug: "scim-crud-app" }) },
      );

      assert.equal(createResponse.status, 201);
      const createdPayload = (await getJson(createResponse)) as { id: string; userName: string };
      assert.equal(createdPayload.userName, "baseline@example.com");

      const listResponse = await usersRoute.GET(
        new Request(
          'http://localhost/api/scim/scim-crud-app/Users?filter=userName%20eq%20%22baseline@example.com%22',
          {
            headers: {
              authorization: `Bearer ${deriveScimBearerToken(app.id)}`,
            },
          },
        ),
        { params: Promise.resolve({ slug: "scim-crud-app" }) },
      );

      assert.equal(listResponse.status, 200);
      const listPayload = (await getJson(listResponse)) as { totalResults: number };
      assert.equal(listPayload.totalResults, 1);

      const patchResponse = await userItemRoute.PATCH(
        new Request(
          `http://localhost/api/scim/scim-crud-app/Users/${createdPayload.id}`,
          {
            method: "PATCH",
            headers: authHeader,
            body: JSON.stringify({
              Operations: [
                { op: "replace", path: "active", value: false },
                { op: "replace", path: "name.givenName", value: "Updated" },
              ],
            }),
          },
        ),
        {
          params: Promise.resolve({
            slug: "scim-crud-app",
            resourceId: createdPayload.id,
          }),
        },
      );

      assert.equal(patchResponse.status, 200);
      const patchedPayload = (await getJson(patchResponse)) as {
        active: boolean;
        name?: { givenName?: string };
      };
      assert.equal(patchedPayload.active, false);
      assert.equal(patchedPayload.name?.givenName, "Updated");

      const deleteResponse = await userItemRoute.DELETE(
        new Request(
          `http://localhost/api/scim/scim-crud-app/Users/${createdPayload.id}`,
          {
            method: "DELETE",
            headers: {
              authorization: `Bearer ${deriveScimBearerToken(app.id)}`,
            },
          },
        ),
        {
          params: Promise.resolve({
            slug: "scim-crud-app",
            resourceId: createdPayload.id,
          }),
        },
      );

      assert.equal(deleteResponse.status, 204);

      const [resourceCount, requestLogCount] = await Promise.all([
        prisma.scimResource.count({ where: { appInstanceId: app.id } }),
        prisma.scimRequestLog.count({ where: { appInstanceId: app.id } }),
      ]);
      assert.equal(resourceCount, 0);
      assert.equal(requestLogCount, 4);
    });
  });
});
