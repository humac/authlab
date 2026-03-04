interface StateEntry {
  slug: string;
  codeVerifier?: string;
  createdAt: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes

const store = new Map<string, StateEntry>();

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.createdAt > TTL_MS) {
      store.delete(key);
    }
  }
}

export function setState(
  state: string,
  entry: Omit<StateEntry, "createdAt">
): void {
  cleanup();
  store.set(state, { ...entry, createdAt: Date.now() });
}

export function getState(state: string): StateEntry | null {
  const entry = store.get(state);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(state);
    return null;
  }
  // One-time use: delete after retrieval
  store.delete(state);
  return entry;
}
