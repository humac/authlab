import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
} from "@simplewebauthn/server";

type RegistrationResponseInput = Parameters<typeof verifyRegistrationResponse>[0]["response"];
type AuthenticationResponseInput = Parameters<typeof verifyAuthenticationResponse>[0]["response"];

function getWebAuthnConfig() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL is required for WebAuthn");
  }

  const url = new URL(appUrl);
  return {
    rpID: url.hostname,
    rpName: "AuthLab",
    expectedOrigin: url.origin,
  };
}

export async function createPasskeyRegistrationOptions(data: {
  userId: string;
  userEmail: string;
  userName: string;
  excludeCredentialIds: string[];
}) {
  const { rpID, rpName } = getWebAuthnConfig();

  return generateRegistrationOptions({
    rpID,
    rpName,
    userID: new TextEncoder().encode(data.userId),
    userName: data.userEmail,
    userDisplayName: data.userName,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
    excludeCredentials: data.excludeCredentialIds.map((id) => ({
      id,
      transports: ["internal", "hybrid", "usb", "nfc", "ble"],
    })),
  });
}

export async function createPasskeyAuthenticationOptions(credentialIds?: string[]) {
  const { rpID } = getWebAuthnConfig();

  return generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: credentialIds?.map((id) => ({
      id,
      transports: ["internal", "hybrid", "usb", "nfc", "ble"],
    })),
  });
}

export async function verifyPasskeyRegistration(data: {
  response: unknown;
  expectedChallenge: string;
}): Promise<VerifiedRegistrationResponse> {
  const { expectedOrigin, rpID } = getWebAuthnConfig();

  return verifyRegistrationResponse({
    response: data.response as RegistrationResponseInput,
    expectedChallenge: data.expectedChallenge,
    expectedOrigin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
}

export async function verifyPasskeyAuthentication(data: {
  response: unknown;
  expectedChallenge: string;
  credential: {
    id: string;
    publicKey: string;
    signCount: number;
  };
}): Promise<VerifiedAuthenticationResponse> {
  const { expectedOrigin, rpID } = getWebAuthnConfig();

  return verifyAuthenticationResponse({
    response: data.response as AuthenticationResponseInput,
    expectedChallenge: data.expectedChallenge,
    expectedOrigin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: data.credential.id,
      publicKey: Buffer.from(data.credential.publicKey, "base64url"),
      counter: data.credential.signCount,
      transports: ["internal", "hybrid", "usb", "nfc", "ble"],
    },
  });
}
