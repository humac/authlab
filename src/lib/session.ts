import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { getAuthRunById } from "@/repositories/auth-run.repo";
import type { AuthRun } from "@/types/auth-run";
import type { SessionData } from "@/types/session";

const SESSION_OPTIONS = {
  password: process.env.SESSION_PASSWORD!,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 3600,
  },
};

export async function getAppSession(slug: string) {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, {
    ...SESSION_OPTIONS,
    cookieName: `authlab_${slug}`,
  });
}

interface SaveAuthSessionInput {
  runId: string;
  slug: string;
  protocol: "OIDC" | "SAML";
  authenticatedAt?: string;
}

export async function saveAuthResultSession(
  session: SessionData & { save: () => Promise<void> },
  input: SaveAuthSessionInput,
): Promise<void> {
  session.runId = input.runId;
  session.appSlug = input.slug;
  session.protocol = input.protocol;
  session.authenticatedAt = input.authenticatedAt ?? new Date().toISOString();
  await session.save();
}

export async function getActiveAuthRun(slug: string): Promise<AuthRun | null> {
  const session = await getAppSession(slug);
  if (!session.runId || session.appSlug !== slug) {
    return null;
  }

  const run = await getAuthRunById(session.runId);
  if (!run || run.status === "LOGGED_OUT") {
    session.destroy();
    return null;
  }

  return run;
}

export async function clearAppSession(slug: string): Promise<void> {
  const session = await getAppSession(slug);
  session.destroy();
}
