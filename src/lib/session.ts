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

type SessionProtocol = "OIDC" | "SAML";

interface SaveAuthSessionInput {
  slug: string;
  protocol: SessionProtocol;
  claims: Record<string, unknown>;
  rawToken?: string;
  rawXml?: string;
  idToken?: string;
  accessToken?: string;
}

function isCookieTooBigError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("Cookie length is too big")
  );
}

function buildCompactClaims(claims: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(claims);
  return {
    _truncated: true,
    _reason: "Session payload exceeded cookie size limit",
    _claimCount: keys.length,
    _claimKeys: keys.slice(0, 100),
  };
}

export async function saveAuthResultSession(
  session: SessionData & { save: () => Promise<void> },
  input: SaveAuthSessionInput,
): Promise<void> {
  session.appSlug = input.slug;
  session.protocol = input.protocol;
  session.claims = input.claims;
  session.rawToken = input.rawToken;
  session.rawXml = input.rawXml;
  session.idToken = input.idToken;
  session.accessToken = input.accessToken;
  session.authenticatedAt = new Date().toISOString();

  try {
    await session.save();
    return;
  } catch (error) {
    if (!isCookieTooBigError(error)) {
      throw error;
    }
  }

  // First fallback: remove largest raw payload fields.
  session.rawXml = undefined;
  session.rawToken = undefined;
  session.accessToken = undefined;

  try {
    await session.save();
    return;
  } catch (error) {
    if (!isCookieTooBigError(error)) {
      throw error;
    }
  }

  // Final fallback: keep only compact claim metadata.
  session.claims = buildCompactClaims(input.claims);
  session.idToken = undefined;
  await session.save();
}
