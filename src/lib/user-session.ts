import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { UserSessionData } from "@/types/user-session";

const USER_SESSION_OPTIONS = {
  password: process.env.SESSION_PASSWORD!,
  cookieName: "authlab_user",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export interface AuthenticatedUserSession {
  userId: string;
  email: string;
  name: string;
  isSystemAdmin: boolean;
  mustChangePassword: boolean;
  isVerified: boolean;
  mfaEnabled: boolean;
  activeTeamId: string;
}

export async function getUserSession() {
  const cookieStore = await cookies();
  return getIronSession<UserSessionData>(cookieStore, USER_SESSION_OPTIONS);
}

export function clearAuthState(session: UserSessionData) {
  delete session.pendingAuth;
  delete session.webauthnChallenge;
  delete session.pendingTotpSetup;
}

export function setAuthenticatedUserSession(
  session: UserSessionData,
  user: {
    id: string;
    email: string;
    name: string;
    isSystemAdmin: boolean;
    mustChangePassword: boolean;
    isVerified: boolean;
    mfaEnabled: boolean;
  },
  activeTeamId: string,
) {
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.isSystemAdmin = user.isSystemAdmin;
  session.mustChangePassword = user.mustChangePassword;
  session.isVerified = user.isVerified;
  session.mfaEnabled = user.mfaEnabled;
  session.activeTeamId = activeTeamId;
  clearAuthState(session);
}

export async function getCurrentUser(): Promise<AuthenticatedUserSession | null> {
  const session = await getUserSession();
  if (!session.userId || !session.email || !session.name || !session.activeTeamId) {
    return null;
  }

  return {
    userId: session.userId,
    email: session.email,
    name: session.name,
    isSystemAdmin: Boolean(session.isSystemAdmin),
    mustChangePassword: Boolean(session.mustChangePassword),
    isVerified: Boolean(session.isVerified),
    mfaEnabled: Boolean(session.mfaEnabled),
    activeTeamId: session.activeTeamId,
  };
}

export async function requireUser(): Promise<AuthenticatedUserSession> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
