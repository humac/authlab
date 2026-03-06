import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importFresh } from "./test-helpers.ts";

describe("webauthn helpers", () => {
  it("builds registration options from the configured app URL", async (t) => {
    process.env.NEXT_PUBLIC_APP_URL = "https://authlab.example.com:8443";
    const generateRegistrationOptions = t.mock.fn((options) => options);

    t.mock.module("@simplewebauthn/server", {
      namedExports: {
        generateRegistrationOptions,
        generateAuthenticationOptions: t.mock.fn(),
        verifyRegistrationResponse: t.mock.fn(),
        verifyAuthenticationResponse: t.mock.fn(),
      },
    });

    const { createPasskeyRegistrationOptions } = await importFresh<
      typeof import("../../src/lib/webauthn.ts")
    >("../../src/lib/webauthn.ts");

    const options = await createPasskeyRegistrationOptions({
      userId: "user-1",
      userEmail: "user@example.com",
      userName: "User",
      excludeCredentialIds: ["cred-1"],
    }) as unknown as {
      rpID: string;
      rpName: string;
      userID: Uint8Array;
      excludeCredentials: Array<{
        id: string;
        transports: string[];
      }>;
    };

    assert.equal(options.rpID, "authlab.example.com");
    assert.equal(options.rpName, "AuthLab");
    assert.equal(new TextDecoder().decode(options.userID), "user-1");
    assert.deepEqual(options.excludeCredentials, [
      {
        id: "cred-1",
        transports: ["internal", "hybrid", "usb", "nfc", "ble"],
      },
    ]);
  });

  it("builds authentication options with allow credentials", async (t) => {
    process.env.NEXT_PUBLIC_APP_URL = "https://authlab.example.com";
    const generateAuthenticationOptions = t.mock.fn((options) => options);

    t.mock.module("@simplewebauthn/server", {
      namedExports: {
        generateRegistrationOptions: t.mock.fn(),
        generateAuthenticationOptions,
        verifyRegistrationResponse: t.mock.fn(),
        verifyAuthenticationResponse: t.mock.fn(),
      },
    });

    const { createPasskeyAuthenticationOptions } = await importFresh<
      typeof import("../../src/lib/webauthn.ts")
    >("../../src/lib/webauthn.ts");

    const options = await createPasskeyAuthenticationOptions(["cred-1", "cred-2"]) as unknown as {
      rpID: string;
      allowCredentials: Array<{
        id: string;
        transports: string[];
      }>;
    };

    assert.equal(options.rpID, "authlab.example.com");
    assert.deepEqual(options.allowCredentials, [
      { id: "cred-1", transports: ["internal", "hybrid", "usb", "nfc", "ble"] },
      { id: "cred-2", transports: ["internal", "hybrid", "usb", "nfc", "ble"] },
    ]);
    assert.equal(generateAuthenticationOptions.mock.calls.length, 1);
  });

  it("verifies registration responses against the expected origin and rp id", async (t) => {
    process.env.NEXT_PUBLIC_APP_URL = "https://authlab.example.com";
    const verifyRegistrationResponse = t.mock.fn(async (options) => options);

    t.mock.module("@simplewebauthn/server", {
      namedExports: {
        generateRegistrationOptions: t.mock.fn(),
        generateAuthenticationOptions: t.mock.fn(),
        verifyRegistrationResponse,
        verifyAuthenticationResponse: t.mock.fn(),
      },
    });

    const { verifyPasskeyRegistration } = await importFresh<
      typeof import("../../src/lib/webauthn.ts")
    >("../../src/lib/webauthn.ts");

    const response = { id: "cred-1" };
    const result = await verifyPasskeyRegistration({
      response,
      expectedChallenge: "challenge-1",
    }) as unknown as {
      expectedOrigin: string;
      expectedRPID: string;
      expectedChallenge: string;
      requireUserVerification: boolean;
      response: unknown;
    };

    assert.equal(result.expectedOrigin, "https://authlab.example.com");
    assert.equal(result.expectedRPID, "authlab.example.com");
    assert.equal(result.expectedChallenge, "challenge-1");
    assert.equal(result.requireUserVerification, true);
    assert.equal(result.response, response);
  });

  it("verifies authentication responses with a decoded public key buffer", async (t) => {
    process.env.NEXT_PUBLIC_APP_URL = "https://authlab.example.com";
    const verifyAuthenticationResponse = t.mock.fn(async (options) => options);

    t.mock.module("@simplewebauthn/server", {
      namedExports: {
        generateRegistrationOptions: t.mock.fn(),
        generateAuthenticationOptions: t.mock.fn(),
        verifyRegistrationResponse: t.mock.fn(),
        verifyAuthenticationResponse,
      },
    });

    const { verifyPasskeyAuthentication } = await importFresh<
      typeof import("../../src/lib/webauthn.ts")
    >("../../src/lib/webauthn.ts");

    const response = { id: "cred-1" };
    const result = await verifyPasskeyAuthentication({
      response,
      expectedChallenge: "challenge-1",
      credential: {
        id: "cred-1",
        publicKey: Buffer.from("public-key").toString("base64url"),
        signCount: 12,
      },
    }) as unknown as {
      expectedOrigin: string;
      expectedRPID: string;
      requireUserVerification: boolean;
      credential: {
        id: string;
        publicKey: Buffer;
        counter: number;
      };
      response: unknown;
    };

    assert.equal(result.expectedOrigin, "https://authlab.example.com");
    assert.equal(result.expectedRPID, "authlab.example.com");
    assert.equal(result.requireUserVerification, true);
    assert.equal(result.credential.id, "cred-1");
    assert.equal(Buffer.from(result.credential.publicKey).toString(), "public-key");
    assert.equal(result.credential.counter, 12);
    assert.equal(result.response, response);
  });

  it("requires NEXT_PUBLIC_APP_URL for passkey flows", async (t) => {
    delete process.env.NEXT_PUBLIC_APP_URL;

    t.mock.module("@simplewebauthn/server", {
      namedExports: {
        generateRegistrationOptions: t.mock.fn(),
        generateAuthenticationOptions: t.mock.fn(),
        verifyRegistrationResponse: t.mock.fn(),
        verifyAuthenticationResponse: t.mock.fn(),
      },
    });

    const { createPasskeyAuthenticationOptions } = await importFresh<
      typeof import("../../src/lib/webauthn.ts")
    >("../../src/lib/webauthn.ts");

    await assert.rejects(
      () => createPasskeyAuthenticationOptions(),
      /NEXT_PUBLIC_APP_URL is required for WebAuthn/,
    );
  });
});
