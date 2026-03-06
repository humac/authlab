export interface PendingAuthChallenge {
  userId: string;
  activeTeamId: string;
  method: "PASSWORD" | "PASSKEY";
  issuedAt: number;
  expiresAt: number;
}

export interface WebAuthnChallengeState {
  challenge: string;
  purpose: "LOGIN" | "REGISTER";
  userId?: string;
  expiresAt: number;
}

export interface PendingTotpSetupState {
  secretEnc: string;
  expiresAt: number;
}

export interface UserSessionData {
  userId?: string;
  email?: string;
  name?: string;
  isSystemAdmin?: boolean;
  mustChangePassword?: boolean;
  isVerified?: boolean;
  mfaEnabled?: boolean;
  activeTeamId?: string;
  pendingAuth?: PendingAuthChallenge;
  webauthnChallenge?: WebAuthnChallengeState;
  pendingTotpSetup?: PendingTotpSetupState;
}
