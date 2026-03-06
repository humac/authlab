import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

describe("auth email helpers", () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });

  it("builds verification emails with the configured app URL", async (t) => {
    const sendTransactionalEmail = t.mock.fn(async () => true);
    t.mock.module("@/lib/email-provider", {
      namedExports: { sendTransactionalEmail },
    });
    process.env.NEXT_PUBLIC_APP_URL = "https://authlab.example.com";

    const { sendEmailVerificationLink } = await importFresh<
      typeof import("../../src/lib/auth-email.ts")
    >("../../src/lib/auth-email.ts");

    await sendEmailVerificationLink({
      email: "user@example.com",
      name: "Taylor",
      token: "verify token/+",
    });

    assert.equal(sendTransactionalEmail.mock.calls.length, 1);
    const firstCall = sendTransactionalEmail.mock.calls.at(0);
    assert.ok(firstCall);
    const email = firstCall.arguments.at(0) as unknown as {
      to: string;
      subject: string;
      text: string;
      html?: string;
    };

    assert.equal(email.to, "user@example.com");
    assert.match(email.subject, /Verify your AuthLab account/);
    assert.match(
      email.text,
      /https:\/\/authlab\.example\.com\/verify-email\?token=verify%20token%2F%2B/,
    );
    assert.match(
      email.html ?? "",
      /https:\/\/authlab\.example\.com\/verify-email\?token=verify%20token%2F%2B/,
    );
  });

  it("falls back to localhost when composing password reset links", async (t) => {
    const sendTransactionalEmail = t.mock.fn(async () => true);
    t.mock.module("@/lib/email-provider", {
      namedExports: { sendTransactionalEmail },
    });
    delete process.env.NEXT_PUBLIC_APP_URL;

    const { sendPasswordResetLink } = await importFresh<
      typeof import("../../src/lib/auth-email.ts")
    >("../../src/lib/auth-email.ts");

    await sendPasswordResetLink({
      email: "user@example.com",
      name: "Taylor",
      token: "reset-token",
    });

    assert.equal(sendTransactionalEmail.mock.calls.length, 1);
    const firstCall = sendTransactionalEmail.mock.calls.at(0);
    assert.ok(firstCall);
    const email = firstCall.arguments.at(0) as unknown as {
      text: string;
      html?: string;
    };

    assert.match(email.text, /http:\/\/localhost:3000\/reset-password\?token=reset-token/);
    assert.match(
      email.html ?? "",
      /http:\/\/localhost:3000\/reset-password\?token=reset-token/,
    );
  });
});
