import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectIdpGroups, groupByTags } from "../../src/lib/idp-detection.ts";
import type { RedactedAppInstance } from "../../src/types/app-instance.ts";

function makeApp(
  overrides: Partial<RedactedAppInstance> & { name: string },
): RedactedAppInstance {
  return {
    id: overrides.id ?? overrides.name.toLowerCase().replace(/\s+/g, "-"),
    name: overrides.name,
    slug: overrides.slug ?? overrides.name.toLowerCase().replace(/\s+/g, "-"),
    protocol: overrides.protocol ?? "OIDC",
    teamId: "team-1",
    issuerUrl: overrides.issuerUrl ?? null,
    clientId: overrides.clientId ?? null,
    scopes: null,
    pkceMode: "S256",
    usePar: false,
    entryPoint: overrides.entryPoint ?? null,
    samlLogoutUrl: null,
    issuer: overrides.issuer ?? null,
    nameIdFormat: null,
    requestedAuthnContext: null,
    forceAuthnDefault: false,
    isPassiveDefault: false,
    samlSignatureAlgorithm: "SHA256",
    clockSkewToleranceSeconds: 0,
    signAuthnRequests: false,
    spSigningCert: null,
    spEncryptionCert: null,
    buttonColor: "#3B71CA",
    tags: overrides.tags ?? [],
    createdAt: new Date(),
    updatedAt: new Date(),
    hasClientSecret: false,
    hasIdpCert: false,
    hasSpSigningPrivateKey: false,
    hasSpSigningCert: false,
    hasSpEncryptionPrivateKey: false,
    hasSpEncryptionCert: false,
    hasNotes: false,
    customAuthParams: [],
  };
}

describe("detectIdpGroups", () => {
  it("groups OIDC apps by issuerUrl hostname", () => {
    const apps = [
      makeApp({ name: "App A", issuerUrl: "https://login.microsoftonline.com/tenant-1/v2.0" }),
      makeApp({ name: "App B", issuerUrl: "https://login.microsoftonline.com/tenant-2/v2.0" }),
      makeApp({ name: "App C", issuerUrl: "https://dev-12345.okta.com" }),
    ];

    const groups = detectIdpGroups(apps);
    assert.equal(groups.length, 2);

    const msGroup = groups.find((g) => g.idpKey === "login.microsoftonline.com");
    assert.ok(msGroup);
    assert.equal(msGroup.apps.length, 2);
    assert.equal(msGroup.isSsoScenario, true);
    assert.equal(msGroup.providerName, "Microsoft Entra ID");

    const oktaGroup = groups.find((g) => g.idpKey === "dev-12345.okta.com");
    assert.ok(oktaGroup);
    assert.equal(oktaGroup.apps.length, 1);
    assert.equal(oktaGroup.isSsoScenario, false);
    assert.equal(oktaGroup.providerName, "Okta");
  });

  it("groups SAML apps by entryPoint hostname", () => {
    const apps = [
      makeApp({
        name: "SAML App 1",
        protocol: "SAML",
        entryPoint: "https://login.microsoftonline.com/tenant/saml2",
      }),
      makeApp({
        name: "SAML App 2",
        protocol: "SAML",
        entryPoint: "https://login.microsoftonline.com/tenant/saml2",
      }),
    ];

    const groups = detectIdpGroups(apps);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].isSsoScenario, true);
    assert.equal(groups[0].providerName, "Microsoft Entra ID");
  });

  it("detects cross-protocol SSO (OIDC + SAML same IDP)", () => {
    const apps = [
      makeApp({ name: "OIDC App", issuerUrl: "https://login.microsoftonline.com/tenant/v2.0" }),
      makeApp({
        name: "SAML App",
        protocol: "SAML",
        entryPoint: "https://login.microsoftonline.com/tenant/saml2",
      }),
    ];

    const groups = detectIdpGroups(apps);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].isCrossProtocol, true);
    assert.equal(groups[0].isSsoScenario, true);
  });

  it("places unconfigured apps in separate group at end", () => {
    const apps = [
      makeApp({ name: "Configured", issuerUrl: "https://accounts.google.com" }),
      makeApp({ name: "No URL" }),
    ];

    const groups = detectIdpGroups(apps);
    assert.equal(groups.length, 2);
    assert.equal(groups[groups.length - 1].label, "Unconfigured");
    assert.equal(groups[groups.length - 1].apps.length, 1);
  });

  it("resolves known provider names", () => {
    const apps = [
      makeApp({ name: "Google", issuerUrl: "https://accounts.google.com" }),
      makeApp({ name: "Auth0", issuerUrl: "https://my-tenant.auth0.com" }),
      makeApp({ name: "OneLogin", issuerUrl: "https://company.onelogin.com/oidc" }),
      makeApp({ name: "Ping", issuerUrl: "https://auth.pingone.com/envid" }),
    ];

    const groups = detectIdpGroups(apps);
    const names = groups.map((g) => g.providerName);
    assert.ok(names.includes("Google Workspace"));
    assert.ok(names.includes("Auth0"));
    assert.ok(names.includes("OneLogin"));
    assert.ok(names.includes("Ping Identity"));
  });

  it("returns empty array for no apps", () => {
    assert.deepEqual(detectIdpGroups([]), []);
  });

  it("normalizes www. prefix", () => {
    const apps = [
      makeApp({ name: "A", issuerUrl: "https://www.example.com/auth" }),
      makeApp({ name: "B", issuerUrl: "https://example.com/auth" }),
    ];
    const groups = detectIdpGroups(apps);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].apps.length, 2);
  });

  it("handles invalid URLs gracefully", () => {
    const apps = [
      makeApp({ name: "Bad URL", issuerUrl: "not-a-url" }),
      makeApp({ name: "Good", issuerUrl: "https://accounts.google.com" }),
    ];
    const groups = detectIdpGroups(apps);
    // Bad URL goes to unconfigured
    assert.equal(groups.length, 2);
    const unconfigured = groups.find((g) => g.label === "Unconfigured");
    assert.ok(unconfigured);
    assert.equal(unconfigured.apps.length, 1);
  });

  it("sorts SSO groups before single-app groups", () => {
    const apps = [
      makeApp({ name: "Solo", issuerUrl: "https://solo.example.com" }),
      makeApp({ name: "A", issuerUrl: "https://shared.example.com" }),
      makeApp({ name: "B", issuerUrl: "https://shared.example.com" }),
    ];
    const groups = detectIdpGroups(apps);
    assert.equal(groups[0].isSsoScenario, true);
    assert.equal(groups[0].idpKey, "shared.example.com");
  });
});

describe("groupByTags", () => {
  it("groups apps by their tags", () => {
    const apps = [
      makeApp({ name: "A", tags: ["production", "okta"] }),
      makeApp({ name: "B", tags: ["production"] }),
      makeApp({ name: "C", tags: ["staging"] }),
    ];

    const groups = groupByTags(apps);
    const prodGroup = groups.find((g) => g.tag === "production");
    assert.ok(prodGroup);
    assert.equal(prodGroup.apps.length, 2);

    const oktaGroup = groups.find((g) => g.tag === "okta");
    assert.ok(oktaGroup);
    assert.equal(oktaGroup.apps.length, 1);

    const stagingGroup = groups.find((g) => g.tag === "staging");
    assert.ok(stagingGroup);
    assert.equal(stagingGroup.apps.length, 1);
  });

  it("places untagged apps in Untagged group at end", () => {
    const apps = [
      makeApp({ name: "Tagged", tags: ["env:prod"] }),
      makeApp({ name: "Not Tagged", tags: [] }),
    ];

    const groups = groupByTags(apps);
    assert.equal(groups[groups.length - 1].tag, "Untagged");
    assert.equal(groups[groups.length - 1].apps.length, 1);
  });

  it("returns single Untagged group for all untagged apps", () => {
    const apps = [
      makeApp({ name: "A", tags: [] }),
      makeApp({ name: "B", tags: [] }),
    ];
    const groups = groupByTags(apps);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].tag, "Untagged");
    assert.equal(groups[0].apps.length, 2);
  });

  it("returns empty array for no apps", () => {
    assert.deepEqual(groupByTags([]), []);
  });

  it("sorts by app count descending then alphabetically", () => {
    const apps = [
      makeApp({ name: "A", tags: ["beta"] }),
      makeApp({ name: "B", tags: ["alpha", "beta"] }),
      makeApp({ name: "C", tags: ["alpha", "beta"] }),
    ];
    const groups = groupByTags(apps);
    // beta has 3 apps, alpha has 2
    assert.equal(groups[0].tag, "beta");
    assert.equal(groups[0].apps.length, 3);
    assert.equal(groups[1].tag, "alpha");
    assert.equal(groups[1].apps.length, 2);
  });
});
