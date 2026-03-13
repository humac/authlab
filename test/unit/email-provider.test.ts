import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh, probeModule } from "./test-helpers.ts";

const skip = await probeModule("nodemailer");

describe("email provider helpers", { skip: skip || undefined }, () => {
  it("returns masked provider settings without exposing secrets", async (t) => {
    const settings = new Map<string, string>([
      ["email.activeProvider", "SMTP"],
      ["email.smtp.host", "smtp.example.com"],
      ["email.smtp.port", "2525"],
      ["email.smtp.secure", "true"],
      ["email.smtp.username", "mailer"],
      ["email.smtp.fromName", "AuthLab"],
      ["email.smtp.fromEmail", "noreply@example.com"],
      ["email.smtp.passwordEnc", "encrypted-password"],
      ["email.brevo.fromName", "Brevo Sender"],
      ["email.brevo.fromEmail", "brevo@example.com"],
    ]);

    t.mock.module("@/repositories/system-setting.repo", {
      namedExports: {
        getSetting: t.mock.fn(async (key: string) => settings.get(key) ?? null),
        setSetting: t.mock.fn(),
      },
    });
    t.mock.module("@/lib/encryption", {
      namedExports: {
        decrypt: t.mock.fn((value: string) => `decrypted:${value}`),
        encrypt: t.mock.fn((value: string) => `encrypted:${value}`),
      },
    });
    t.mock.module("nodemailer", {
      defaultExport: {
        createTransport: t.mock.fn(),
      },
    });

    const { getMaskedEmailProviderConfig } = await importFresh<
      typeof import("../../src/lib/email-provider.ts")
    >("../../src/lib/email-provider.ts");

    const result = await getMaskedEmailProviderConfig();

    assert.deepEqual(result, {
      activeProvider: "SMTP",
      smtp: {
        host: "smtp.example.com",
        port: 2525,
        secure: true,
        username: "mailer",
        fromName: "AuthLab",
        fromEmail: "noreply@example.com",
        hasPassword: true,
      },
      brevo: {
        fromName: "Brevo Sender",
        fromEmail: "brevo@example.com",
        hasApiKey: false,
      },
    });
  });

  it("persists SMTP secrets in encrypted form", async (t) => {
    const setSetting = t.mock.fn(async () => undefined);
    const encrypt = t.mock.fn((value: string) => `encrypted:${value}`);

    t.mock.module("@/repositories/system-setting.repo", {
      namedExports: {
        getSetting: t.mock.fn(async () => null),
        setSetting,
      },
    });
    t.mock.module("@/lib/encryption", {
      namedExports: {
        decrypt: t.mock.fn(),
        encrypt,
      },
    });
    t.mock.module("nodemailer", {
      defaultExport: {
        createTransport: t.mock.fn(),
      },
    });

    const { saveEmailProviderConfig } = await importFresh<
      typeof import("../../src/lib/email-provider.ts")
    >("../../src/lib/email-provider.ts");

    await saveEmailProviderConfig({
      activeProvider: "SMTP",
      smtp: {
        host: "smtp.example.com",
        port: 587,
        secure: false,
        username: "mailer",
        password: "smtp-password",
        fromName: "AuthLab",
        fromEmail: "noreply@example.com",
      },
    });

    assert.ok(setSetting.mock.calls.length > 0);
    const savedPairs = setSetting.mock.calls.map(
      (call) => call.arguments as unknown as [string, string],
    );

    assert.ok(
      savedPairs.some(
        ([key, value]) => key === "email.smtp.passwordEnc" && value === "encrypted:smtp-password",
      ),
    );
    assert.equal(encrypt.mock.calls[0]?.arguments[0], "smtp-password");
  });

  it("resolves a trimmed Brevo API key from persisted encrypted settings", async (t) => {
    t.mock.module("@/repositories/system-setting.repo", {
      namedExports: {
        getSetting: t.mock.fn(async (key: string) =>
          key === "email.brevo.apiKeyEnc" ? "encrypted-api-key" : null
        ),
        setSetting: t.mock.fn(),
      },
    });
    t.mock.module("@/lib/encryption", {
      namedExports: {
        decrypt: t.mock.fn(() => "  live-brevo-key  "),
        encrypt: t.mock.fn(),
      },
    });
    t.mock.module("nodemailer", {
      defaultExport: {
        createTransport: t.mock.fn(),
      },
    });

    const { resolveBrevoApiKeyForTest } = await importFresh<
      typeof import("../../src/lib/email-provider.ts")
    >("../../src/lib/email-provider.ts");

    assert.equal(await resolveBrevoApiKeyForTest(), "live-brevo-key");
  });

  it("returns false when no active provider configuration exists", async (t) => {
    t.mock.module("@/repositories/system-setting.repo", {
      namedExports: {
        getSetting: t.mock.fn(async () => null),
        setSetting: t.mock.fn(),
      },
    });
    t.mock.module("@/lib/encryption", {
      namedExports: {
        decrypt: t.mock.fn(),
        encrypt: t.mock.fn(),
      },
    });
    t.mock.module("nodemailer", {
      defaultExport: {
        createTransport: t.mock.fn(),
      },
    });

    const { sendTransactionalEmail } = await importFresh<
      typeof import("../../src/lib/email-provider.ts")
    >("../../src/lib/email-provider.ts");

    const sent = await sendTransactionalEmail({
      to: "user@example.com",
      subject: "Hello",
      text: "Body",
    });

    assert.equal(sent, false);
  });

  it("sends with Brevo when an active config is present", async (t) => {
    const settings = new Map<string, string>([
      ["email.activeProvider", "BREVO"],
      ["email.brevo.apiKeyEnc", "encrypted-api-key"],
      ["email.brevo.fromName", "AuthLab"],
      ["email.brevo.fromEmail", "noreply@example.com"],
    ]);
    const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];

    t.mock.module("@/repositories/system-setting.repo", {
      namedExports: {
        getSetting: t.mock.fn(async (key: string) => settings.get(key) ?? null),
        setSetting: t.mock.fn(),
      },
    });
    t.mock.module("@/lib/encryption", {
      namedExports: {
        decrypt: t.mock.fn(() => "brevo-api-key"),
        encrypt: t.mock.fn(),
      },
    });
    t.mock.module("nodemailer", {
      defaultExport: {
        createTransport: t.mock.fn(),
      },
    });
    t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init });
      return new Response(null, { status: 202 });
    });

    const { sendTransactionalEmail } = await importFresh<
      typeof import("../../src/lib/email-provider.ts")
    >("../../src/lib/email-provider.ts");

    const sent = await sendTransactionalEmail({
      to: "user@example.com",
      subject: "Hello",
      text: "Body",
      html: "<p>Body</p>",
    });

    assert.equal(sent, true);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0]?.url, "https://api.brevo.com/v3/smtp/email");
    assert.ok(fetchCalls[0]?.init);
    assert.equal(
      ((fetchCalls[0]!.init as RequestInit).headers as Record<string, string>)["api-key"],
      "brevo-api-key",
    );
  });
});
