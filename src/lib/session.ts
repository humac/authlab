import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { SessionData } from "@/types/session";

const SESSION_OPTIONS = {
  password: process.env.SESSION_PASSWORD!,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 3600, // 1 hour — appropriate for test sessions
  },
};

export async function getAppSession(slug: string) {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, {
    ...SESSION_OPTIONS,
    cookieName: `authlab_${slug}`,
  });
}
