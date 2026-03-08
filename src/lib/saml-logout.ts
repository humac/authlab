import type { AuthRun } from "@/types/auth-run";
import type { SamlLogoutProfile } from "@/lib/saml-handler";

function stringClaim(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function claimFromRun(
  run: Pick<AuthRun, "claims">,
  primary: string,
  alternate?: string,
): string | undefined {
  return stringClaim(run.claims[primary]) ?? (alternate ? stringClaim(run.claims[alternate]) : undefined);
}

export function getSamlLogoutProfileFromRun(
  run: Pick<AuthRun, "protocol" | "claims"> | null,
): SamlLogoutProfile | null {
  if (!run || run.protocol !== "SAML") {
    return null;
  }

  const nameID = claimFromRun(run, "nameID", "NameID");
  if (!nameID) {
    return null;
  }

  return {
    nameID,
    nameIDFormat:
      claimFromRun(run, "nameIDFormat", "NameIDFormat") ??
      "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified",
    nameQualifier: claimFromRun(run, "nameQualifier", "NameQualifier"),
    spNameQualifier: claimFromRun(run, "spNameQualifier", "SPNameQualifier"),
    sessionIndex: claimFromRun(run, "sessionIndex", "SessionIndex"),
  };
}

export function matchesSamlLogoutProfile(
  activeProfile: SamlLogoutProfile | null,
  requestProfile: SamlLogoutProfile | null,
): boolean {
  if (!activeProfile || !requestProfile) {
    return false;
  }

  if (activeProfile.nameID !== requestProfile.nameID) {
    return false;
  }

  if (
    requestProfile.sessionIndex &&
    activeProfile.sessionIndex &&
    requestProfile.sessionIndex !== activeProfile.sessionIndex
  ) {
    return false;
  }

  return true;
}
