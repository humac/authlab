import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { getPrisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { _resetAllStores } from "@/lib/rate-limit";
import {
  createUser,
  getJson,
  resetDatabase,
} from "../integration/test-helpers.ts";
import { importFresh } from "../unit/test-helpers.ts";

function jsonRequest(url: string, body: unknown, ip = "127.0.0.1") {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

describe("security regressions: auth abuse cases", () => {
  beforeEach(async () => {
    await resetDatabase();
    _resetAllStores();
  });

  describe("registration abuse controls", () => {
    it("returns the same outward response for verified and unverified existing accounts without creating duplicates", async (t) => {
      const verifiedUser = await createUser({
        email: "verified@example.com",
        isVerified: true,
      });
      const pendingUser = await createUser({
        email: "pending@example.com",
        isVerified: false,
      });
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

      const verifiedResponse = await route.POST(
        jsonRequest(
          "http://localhost/api/user/register",
          {
            email: verifiedUser.email,
            name: "Verified User",
            password: "StrongPassword123!",
          },
          "198.51.100.10",
        ),
      );
      const pendingResponse = await route.POST(
        jsonRequest(
          "http://localhost/api/user/register",
          {
            email: pendingUser.email,
            name: "Pending User",
            password: "StrongPassword123!",
          },
          "198.51.100.11",
        ),
      );

      assert.equal(verifiedResponse.status, 200);
      assert.equal(pendingResponse.status, 200);
      assert.deepEqual(await getJson(verifiedResponse), {
        message: "If an account can be created, a verification email has been sent.",
      });
      assert.deepEqual(await getJson(pendingResponse), {
        message: "If an account can be created, a verification email has been sent.",
      });

      const prisma = await getPrisma();
      assert.equal(await prisma.user.count(), 2);
      const verifyTokens = await prisma.authToken.findMany({
        where: { purpose: "EMAIL_VERIFY" },
      });
      assert.equal(verifyTokens.length, 1);
      assert.equal(verifyTokens[0]?.userId, pendingUser.id);
      assert.equal(sentEmails.length, 1);
      assert.equal(sentEmails[0]?.email, pendingUser.email);
    });
  });

  describe("login abuse controls", () => {
    it("returns the same invalid-login response for unknown users, wrong passwords, and unverified accounts", async () => {
      const passwordHash = await hashPassword("CorrectHorseBatteryStaple1!");
      await createUser({
        email: "verified-login@example.com",
        passwordHash,
        isVerified: true,
      });
      await createUser({
        email: "unverified-login@example.com",
        passwordHash,
        isVerified: false,
      });

      const route = await importFresh<
        typeof import("../../src/app/api/user/login/route.ts")
      >("../../src/app/api/user/login/route.ts");

      const responses = await Promise.all([
        route.POST(
          jsonRequest(
            "http://localhost/api/user/login",
            { email: "missing@example.com", password: "CorrectHorseBatteryStaple1!" },
            "203.0.113.10",
          ),
        ),
        route.POST(
          jsonRequest(
            "http://localhost/api/user/login",
            { email: "verified-login@example.com", password: "WrongPassword123!" },
            "203.0.113.11",
          ),
        ),
        route.POST(
          jsonRequest(
            "http://localhost/api/user/login",
            { email: "unverified-login@example.com", password: "CorrectHorseBatteryStaple1!" },
            "203.0.113.12",
          ),
        ),
      ]);

      for (const response of responses) {
        assert.equal(response.status, 401);
        assert.deepEqual(await getJson(response), {
          error: "Invalid email or password",
        });
      }
    });

    it("rate limits repeated login attempts by IP while leaving other IPs unaffected", async () => {
      const route = await importFresh<
        typeof import("../../src/app/api/user/login/route.ts")
      >("../../src/app/api/user/login/route.ts");

      for (let attempt = 0; attempt < 10; attempt += 1) {
        const response = await route.POST(
          jsonRequest(
            "http://localhost/api/user/login",
            { email: "missing@example.com", password: "WrongPassword123!" },
            "203.0.113.44",
          ),
        );
        assert.equal(response.status, 401);
      }

      const blocked = await route.POST(
        jsonRequest(
          "http://localhost/api/user/login",
          { email: "missing@example.com", password: "WrongPassword123!" },
          "203.0.113.44",
        ),
      );
      assert.equal(blocked.status, 429);
      assert.deepEqual(await getJson(blocked), {
        error: "Too many requests. Please try again later.",
      });
      assert.ok(Number(blocked.headers.get("Retry-After")) >= 1);

      const otherIp = await route.POST(
        jsonRequest(
          "http://localhost/api/user/login",
          { email: "missing@example.com", password: "WrongPassword123!" },
          "203.0.113.45",
        ),
      );
      assert.equal(otherIp.status, 401);
    });
  });

  describe("generic recovery flows", () => {
    it("keeps password reset responses generic and only issues tokens for verified users", async (t) => {
      const verifiedUser = await createUser({
        email: "verified-reset@example.com",
        isVerified: true,
      });
      await createUser({
        email: "pending-reset@example.com",
        isVerified: false,
      });
      const sentEmails: Array<{ email: string; name: string; token: string }> = [];

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

      const responses = await Promise.all([
        route.POST(
          jsonRequest(
            "http://localhost/api/user/password-reset/request",
            { email: "missing-reset@example.com" },
            "198.51.100.20",
          ),
        ),
        route.POST(
          jsonRequest(
            "http://localhost/api/user/password-reset/request",
            { email: "pending-reset@example.com" },
            "198.51.100.21",
          ),
        ),
        route.POST(
          jsonRequest(
            "http://localhost/api/user/password-reset/request",
            { email: "verified-reset@example.com" },
            "198.51.100.22",
          ),
        ),
      ]);

      for (const response of responses) {
        assert.equal(response.status, 200);
        assert.deepEqual(await getJson(response), {
          message: "If an account exists, a password reset email has been sent.",
        });
      }

      const prisma = await getPrisma();
      const tokens = await prisma.authToken.findMany({
        where: { purpose: "PASSWORD_RESET" },
      });
      assert.equal(tokens.length, 1);
      assert.equal(tokens[0]?.userId, verifiedUser.id);
      assert.equal(sentEmails.length, 1);
      assert.equal(sentEmails[0]?.email, verifiedUser.email);
    });

    it("keeps verification resend responses generic and only issues tokens for pending users", async (t) => {
      await createUser({
        email: "verified-resend@example.com",
        isVerified: true,
      });
      const pendingUser = await createUser({
        email: "pending-resend@example.com",
        isVerified: false,
      });
      const sentEmails: Array<{ email: string; name: string; token: string }> = [];

      t.mock.module("@/lib/auth-email", {
        namedExports: {
          sendEmailVerificationLink: t.mock.fn(async (payload) => {
            sentEmails.push(payload);
          }),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/user/verify-email/resend/route.ts")
      >("../../src/app/api/user/verify-email/resend/route.ts");

      const responses = await Promise.all([
        route.POST(
          jsonRequest(
            "http://localhost/api/user/verify-email/resend",
            { email: "missing-resend@example.com" },
            "198.51.100.30",
          ),
        ),
        route.POST(
          jsonRequest(
            "http://localhost/api/user/verify-email/resend",
            { email: "verified-resend@example.com" },
            "198.51.100.31",
          ),
        ),
        route.POST(
          jsonRequest(
            "http://localhost/api/user/verify-email/resend",
            { email: "pending-resend@example.com" },
            "198.51.100.32",
          ),
        ),
      ]);

      for (const response of responses) {
        assert.equal(response.status, 200);
        assert.deepEqual(await getJson(response), {
          message: "If the account exists, a verification email has been sent.",
        });
      }

      const prisma = await getPrisma();
      const tokens = await prisma.authToken.findMany({
        where: { purpose: "EMAIL_VERIFY" },
      });
      assert.equal(tokens.length, 1);
      assert.equal(tokens[0]?.userId, pendingUser.id);
      assert.equal(sentEmails.length, 1);
      assert.equal(sentEmails[0]?.email, pendingUser.email);
    });
  });

  describe("step-up auth abuse controls", () => {
    it("expires pending MFA sessions after too many invalid codes", async (t) => {
      const user = await createUser({
        email: "mfa-user@example.com",
        isVerified: true,
        mfaEnabled: true,
      });
      const prisma = await getPrisma();
      await prisma.user.update({
        where: { id: user.id },
        data: { totpSecretEnc: "encrypted-secret" },
      });

      const session: Record<string, unknown> = {
        pendingAuth: {
          userId: user.id,
          activeTeamId: "team-123",
          method: "PASSWORD",
          issuedAt: Date.now(),
          expiresAt: Date.now() + 10 * 60 * 1000,
        },
        save: t.mock.fn(async () => undefined),
      };

      t.mock.module("@/lib/user-session", {
        namedExports: {
          getUserSession: t.mock.fn(async () => session),
          setAuthenticatedUserSession: t.mock.fn(() => undefined),
        },
      });
      t.mock.module("@/lib/encryption", {
        namedExports: {
          decrypt: t.mock.fn(() => "totp-secret"),
        },
      });
      t.mock.module("@/lib/totp", {
        namedExports: {
          verifyTotpToken: t.mock.fn(() => false),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/user/login/mfa/totp/route.ts")
      >("../../src/app/api/user/login/mfa/totp/route.ts");

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await route.POST(
          jsonRequest(
            "http://localhost/api/user/login/mfa/totp",
            { code: "000000" },
            `198.51.100.${40 + attempt}`,
          ),
        );
        assert.equal(response.status, 401);
        assert.deepEqual(await getJson(response), {
          error: "Invalid MFA code",
        });
      }

      assert.equal(
        (session.pendingAuth as { mfaAttempts?: number }).mfaAttempts,
        5,
      );

      const exhausted = await route.POST(
        jsonRequest(
          "http://localhost/api/user/login/mfa/totp",
          { code: "000000" },
          "198.51.100.99",
        ),
      );
      assert.equal(exhausted.status, 401);
      assert.deepEqual(await getJson(exhausted), {
        error: "Too many failed MFA attempts. Please log in again.",
      });
      assert.equal("pendingAuth" in session, false);
    });

    it("rejects expired passkey login challenges and clears the challenge from session", async (t) => {
      const session: Record<string, unknown> = {
        webauthnChallenge: {
          challenge: "expired-challenge",
          purpose: "LOGIN",
          expiresAt: Date.now() - 1_000,
        },
        save: t.mock.fn(async () => undefined),
      };

      t.mock.module("@/lib/user-session", {
        namedExports: {
          getUserSession: t.mock.fn(async () => session),
          clearAuthState: t.mock.fn(() => undefined),
          setAuthenticatedUserSession: t.mock.fn(() => undefined),
        },
      });

      const route = await importFresh<
        typeof import("../../src/app/api/user/passkeys/login/verify/route.ts")
      >("../../src/app/api/user/passkeys/login/verify/route.ts");

      const response = await route.POST(
        jsonRequest(
          "http://localhost/api/user/passkeys/login/verify",
          { response: { id: "credential-1" } },
          "203.0.113.91",
        ),
      );

      assert.equal(response.status, 401);
      assert.deepEqual(await getJson(response), {
        error: "Challenge expired",
      });
      assert.equal("webauthnChallenge" in session, false);
    });
  });
});
