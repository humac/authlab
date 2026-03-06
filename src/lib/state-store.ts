import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

interface StateEntry {
  slug: string;
  codeVerifier?: string;
  createdAt: number;
}

interface PendingAuthSessionData {
  pendingStates?: Record<string, StateEntry>;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes

const STATE_SESSION_OPTIONS = {
  password: process.env.SESSION_PASSWORD!,
  cookieName: "authlab_pending_auth",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    // SAML IdP callbacks are cross-site POSTs; browsers require SameSite=None
    // for the pending auth cookie to be included in production.
    sameSite:
      process.env.NODE_ENV === "production"
        ? ("none" as const)
        : ("lax" as const),
    path: "/",
    maxAge: 600, // 10 minutes
  },
};

async function getStateSession() {
  const cookieStore = await cookies();
  return getIronSession<PendingAuthSessionData>(
    cookieStore,
    STATE_SESSION_OPTIONS,
  );
}

function pruneExpiredStates(
  pendingStates: Record<string, StateEntry> | undefined,
  now: number,
): Record<string, StateEntry> {
  if (!pendingStates) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(pendingStates).filter(
      ([, entry]) => now - entry.createdAt <= TTL_MS,
    ),
  );
}

export async function setState(
  state: string,
  entry: Omit<StateEntry, "createdAt">,
): Promise<void> {
  const session = await getStateSession();
  const pendingStates = pruneExpiredStates(session.pendingStates, Date.now());

  pendingStates[state] = {
    ...entry,
    createdAt: Date.now(),
  };

  session.pendingStates = pendingStates;
  await session.save();
}

export async function getState(state: string): Promise<StateEntry | null> {
  const session = await getStateSession();
  const now = Date.now();
  const pendingStates = pruneExpiredStates(session.pendingStates, now);
  const entry = pendingStates[state];

  if (!entry) {
    if (
      session.pendingStates &&
      Object.keys(session.pendingStates).length !== Object.keys(pendingStates).length
    ) {
      session.pendingStates = pendingStates;
      await session.save();
    }

    return null;
  }

  delete pendingStates[state];
  session.pendingStates = pendingStates;
  await session.save();

  return entry;
}
