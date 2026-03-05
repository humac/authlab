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

export async function getUserSession() {
  const cookieStore = await cookies();
  return getIronSession<UserSessionData>(cookieStore, USER_SESSION_OPTIONS);
}

export async function getCurrentUser(): Promise<UserSessionData | null> {
  const session = await getUserSession();
  if (!session.userId) return null;
  return {
    userId: session.userId,
    email: session.email,
    name: session.name,
    isSystemAdmin: session.isSystemAdmin,
    mustChangePassword: Boolean(session.mustChangePassword),
    activeTeamId: session.activeTeamId,
  };
}

export async function requireUser(): Promise<UserSessionData> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
