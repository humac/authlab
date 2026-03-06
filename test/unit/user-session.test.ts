import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

describe("user session helpers", () => {
  it("gets the iron session with the configured cookie settings", async (t) => {
    const originalPassword = process.env.SESSION_PASSWORD;
    process.env.SESSION_PASSWORD = "test-session-password";

    const cookieStore = { cookie: "value" };
    const session = { userId: "user-1" };
    const cookies = t.mock.fn(async () => cookieStore);
    const getIronSession = t.mock.fn(async () => session);

    t.mock.module("next/headers", {
      namedExports: { cookies },
    });
    t.mock.module("next/navigation.js", {
      namedExports: { redirect: t.mock.fn() },
    });
    t.mock.module("iron-session", {
      namedExports: { getIronSession },
    });

    const { getUserSession } = await importFresh<
      typeof import("../../src/lib/user-session.ts")
    >("../../src/lib/user-session.ts");

    assert.equal(await getUserSession(), session);
    assert.equal(getIronSession.mock.calls.length, 1);
    const getIronSessionCall = getIronSession.mock.calls.at(0);
    assert.ok(getIronSessionCall);
    const [passedStore, options] = getIronSessionCall.arguments as unknown as [
      typeof cookieStore,
      {
        password: string;
        cookieName: string;
        cookieOptions: {
          httpOnly: boolean;
          sameSite: string;
        };
      },
    ];
    assert.equal(passedStore, cookieStore);
    assert.equal(options.password, "test-session-password");
    assert.equal(options.cookieName, "authlab_user");
    assert.equal(options.cookieOptions.httpOnly, true);
    assert.equal(options.cookieOptions.sameSite, "lax");

    process.env.SESSION_PASSWORD = originalPassword;
  });

  it("sets the authenticated user session and clears pending auth state", async (t) => {
    t.mock.module("next/headers", {
      namedExports: { cookies: t.mock.fn(async () => ({})) },
    });
    t.mock.module("next/navigation.js", {
      namedExports: { redirect: t.mock.fn() },
    });
    t.mock.module("iron-session", {
      namedExports: { getIronSession: t.mock.fn(async () => ({})) },
    });

    const {
      setAuthenticatedUserSession,
    } = await importFresh<typeof import("../../src/lib/user-session.ts")>(
      "../../src/lib/user-session.ts",
    );

    const session = {
      pendingAuth: { userId: "user-1" },
      webauthnChallenge: { challenge: "abc" },
      pendingTotpSetup: { secretEnc: "enc" },
    };

    setAuthenticatedUserSession(
      session as never,
      {
        id: "user-1",
        email: "user@example.com",
        name: "User",
        isSystemAdmin: true,
        mustChangePassword: false,
        isVerified: true,
        mfaEnabled: true,
      },
      "team-1",
    );

    assert.deepEqual(session, {
      userId: "user-1",
      email: "user@example.com",
      name: "User",
      isSystemAdmin: true,
      mustChangePassword: false,
      isVerified: true,
      mfaEnabled: true,
      activeTeamId: "team-1",
    });
  });

  it("returns null when the session is missing required user fields", async (t) => {
    t.mock.module("next/headers", {
      namedExports: { cookies: t.mock.fn(async () => ({})) },
    });
    t.mock.module("next/navigation.js", {
      namedExports: { redirect: t.mock.fn() },
    });
    t.mock.module("iron-session", {
      namedExports: {
        getIronSession: t.mock.fn(async () => ({
          userId: "user-1",
          email: "user@example.com",
        })),
      },
    });

    const { getCurrentUser } = await importFresh<
      typeof import("../../src/lib/user-session.ts")
    >("../../src/lib/user-session.ts");

    assert.equal(await getCurrentUser(), null);
  });

  it("normalizes boolean flags from the stored session", async (t) => {
    t.mock.module("next/headers", {
      namedExports: { cookies: t.mock.fn(async () => ({})) },
    });
    t.mock.module("next/navigation.js", {
      namedExports: { redirect: t.mock.fn() },
    });
    t.mock.module("iron-session", {
      namedExports: {
        getIronSession: t.mock.fn(async () => ({
          userId: "user-1",
          email: "user@example.com",
          name: "User",
          activeTeamId: "team-1",
          isSystemAdmin: 1,
          mustChangePassword: 0,
          isVerified: "yes",
          mfaEnabled: "",
        })),
      },
    });

    const { getCurrentUser } = await importFresh<
      typeof import("../../src/lib/user-session.ts")
    >("../../src/lib/user-session.ts");

    assert.deepEqual(await getCurrentUser(), {
      userId: "user-1",
      email: "user@example.com",
      name: "User",
      activeTeamId: "team-1",
      isSystemAdmin: true,
      mustChangePassword: false,
      isVerified: true,
      mfaEnabled: false,
    });
  });

  it("redirects unauthenticated users to login", async (t) => {
    const redirect = t.mock.fn(() => {
      throw new Error("redirect:/login");
    });

    t.mock.module("next/headers", {
      namedExports: { cookies: t.mock.fn(async () => ({})) },
    });
    t.mock.module("next/navigation.js", {
      namedExports: { redirect },
    });
    t.mock.module("iron-session", {
      namedExports: { getIronSession: t.mock.fn(async () => ({})) },
    });

    const { requireUser } = await importFresh<
      typeof import("../../src/lib/user-session.ts")
    >("../../src/lib/user-session.ts");

    await assert.rejects(() => requireUser(), /redirect:\/login/);
    assert.equal(redirect.mock.calls.length, 1);
  });
});
