import type { AuthRunEvent } from "@/types/auth-run";

export interface DeviceAuthorizationSnapshot {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string | null;
  expiresIn: number;
  interval: number | null;
  requestedScopes: string | null;
  startedAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getDeviceAuthorizationSnapshotFromEvent(
  event: AuthRunEvent | null | undefined,
): DeviceAuthorizationSnapshot | null {
  if (!event || event.type !== "DEVICE_AUTHORIZATION_STARTED" || !isRecord(event.metadata)) {
    return null;
  }

  const metadata = event.metadata;
  const deviceCode =
    typeof metadata.deviceCode === "string" ? metadata.deviceCode : null;
  const userCode = typeof metadata.userCode === "string" ? metadata.userCode : null;
  const verificationUri =
    typeof metadata.verificationUri === "string" ? metadata.verificationUri : null;
  const expiresIn =
    typeof metadata.expiresIn === "number" ? metadata.expiresIn : null;

  if (!deviceCode || !userCode || !verificationUri || !expiresIn) {
    return null;
  }

  return {
    deviceCode,
    userCode,
    verificationUri,
    verificationUriComplete:
      typeof metadata.verificationUriComplete === "string"
        ? metadata.verificationUriComplete
        : null,
    expiresIn,
    interval: typeof metadata.interval === "number" ? metadata.interval : null,
    requestedScopes:
      typeof metadata.requestedScopes === "string" ? metadata.requestedScopes : null,
    startedAt: typeof metadata.startedAt === "string" ? metadata.startedAt : null,
  };
}

export function getLatestDeviceAuthorizationSnapshot(
  events: AuthRunEvent[],
): DeviceAuthorizationSnapshot | null {
  for (const event of events) {
    const snapshot = getDeviceAuthorizationSnapshotFromEvent(event);
    if (snapshot) {
      return snapshot;
    }
  }

  return null;
}
