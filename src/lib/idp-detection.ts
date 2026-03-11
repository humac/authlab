import type { RedactedAppInstance } from "@/types/app-instance";

export interface IdpGroup {
  /** Normalized hostname used as grouping key */
  idpKey: string;
  /** Display-friendly hostname */
  label: string;
  /** Well-known provider name, if detected */
  providerName: string | null;
  /** Apps sharing this IDP */
  apps: RedactedAppInstance[];
  /** Group contains both OIDC and SAML apps */
  isCrossProtocol: boolean;
  /** Group contains more than one app (SSO scenario) */
  isSsoScenario: boolean;
}

export interface TagGroup {
  tag: string;
  apps: RedactedAppInstance[];
}

const KNOWN_PROVIDERS: Record<string, string> = {
  "login.microsoftonline.com": "Microsoft Entra ID",
  "login.microsoft.com": "Microsoft Entra ID",
  "sts.windows.net": "Microsoft Entra ID",
  "accounts.google.com": "Google Workspace",
};

function resolveProviderName(hostname: string): string | null {
  if (KNOWN_PROVIDERS[hostname]) return KNOWN_PROVIDERS[hostname];
  if (
    hostname.endsWith(".okta.com") ||
    hostname.endsWith(".oktapreview.com")
  )
    return "Okta";
  if (hostname.endsWith(".auth0.com")) return "Auth0";
  if (hostname.endsWith(".onelogin.com")) return "OneLogin";
  if (
    hostname.endsWith(".pingidentity.com") ||
    hostname.endsWith(".pingone.com") ||
    hostname.endsWith(".pingone.eu") ||
    hostname.endsWith(".pingone.ca") ||
    hostname.endsWith(".pingone.asia")
  )
    return "Ping Identity";
  if (hostname.endsWith(".duendesoftware.com")) return "Duende IdentityServer";
  if (hostname.endsWith(".keycloak.org") || hostname === "keycloak")
    return "Keycloak";
  return null;
}

function extractIdpHostname(app: RedactedAppInstance): string | null {
  const url =
    app.protocol === "OIDC" ? app.issuerUrl : app.entryPoint;
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function detectIdpGroups(apps: RedactedAppInstance[]): IdpGroup[] {
  const groupMap = new Map<
    string,
    { label: string; apps: RedactedAppInstance[] }
  >();

  for (const app of apps) {
    const hostname = extractIdpHostname(app);
    const key = hostname ?? "__unconfigured__";
    const label = hostname ?? "Unconfigured";

    const existing = groupMap.get(key);
    if (existing) {
      existing.apps.push(app);
    } else {
      groupMap.set(key, { label, apps: [app] });
    }
  }

  const groups: IdpGroup[] = [];
  const unconfigured = groupMap.get("__unconfigured__");
  groupMap.delete("__unconfigured__");

  for (const [idpKey, { label, apps: groupApps }] of groupMap) {
    const protocols = new Set(groupApps.map((a) => a.protocol));
    groups.push({
      idpKey,
      label,
      providerName: resolveProviderName(idpKey),
      apps: groupApps,
      isCrossProtocol: protocols.size > 1,
      isSsoScenario: groupApps.length > 1,
    });
  }

  // Sort: SSO scenarios first, then by app count desc, then alphabetical
  groups.sort((a, b) => {
    if (a.isSsoScenario !== b.isSsoScenario)
      return a.isSsoScenario ? -1 : 1;
    if (a.apps.length !== b.apps.length) return b.apps.length - a.apps.length;
    return a.label.localeCompare(b.label);
  });

  // Unconfigured group always last
  if (unconfigured && unconfigured.apps.length > 0) {
    groups.push({
      idpKey: "__unconfigured__",
      label: "Unconfigured",
      providerName: null,
      apps: unconfigured.apps,
      isCrossProtocol: false,
      isSsoScenario: false,
    });
  }

  return groups;
}

export function groupByTags(apps: RedactedAppInstance[]): TagGroup[] {
  const tagMap = new Map<string, RedactedAppInstance[]>();
  const untagged: RedactedAppInstance[] = [];

  for (const app of apps) {
    if (!app.tags || app.tags.length === 0) {
      untagged.push(app);
      continue;
    }
    for (const tag of app.tags) {
      const existing = tagMap.get(tag);
      if (existing) {
        existing.push(app);
      } else {
        tagMap.set(tag, [app]);
      }
    }
  }

  const groups: TagGroup[] = [];
  for (const [tag, tagApps] of tagMap) {
    groups.push({ tag, apps: tagApps });
  }

  // Sort by app count desc, then alphabetical
  groups.sort((a, b) => {
    if (a.apps.length !== b.apps.length) return b.apps.length - a.apps.length;
    return a.tag.localeCompare(b.tag);
  });

  if (untagged.length > 0) {
    groups.push({ tag: "Untagged", apps: untagged });
  }

  return groups;
}
