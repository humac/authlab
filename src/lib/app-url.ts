const DEFAULT_APP_URL = "http://localhost:3000";

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getAppUrl(): string {
  const configuredUrl =
    process.env.NEXT_PUBLIC_CUSTOM_DOMAIN ||
    process.env.NEXT_PUBLIC_APP_URL ||
    DEFAULT_APP_URL;

  return normalizeUrl(configuredUrl);
}
