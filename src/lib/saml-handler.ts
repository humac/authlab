import { SAML } from "@node-saml/node-saml";
import { randomBytes } from "crypto";
import type { Profile } from "@node-saml/node-saml/lib/types";
import type { DecryptedAppInstance } from "@/types/app-instance";
import type {
  AuthHandler,
  AuthorizationResult,
  AuthRequestOptions,
  AuthResult,
} from "./auth-factory";
import { sanitizeXml } from "./xxe-sanitizer";

function normalizeBooleanOverride(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value === "true";
}

function normalizeStringOverride(
  value: string | undefined,
  fallback: string | null,
): string | null {
  if (value === undefined) {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapSignatureAlgorithm(value: "SHA1" | "SHA256"): "sha1" | "sha256" {
  return value === "SHA1" ? "sha1" : "sha256";
}

export interface SamlLogoutProfile {
  ID?: string;
  issuer?: string;
  nameID: string;
  nameIDFormat: string;
  nameQualifier?: string;
  spNameQualifier?: string;
  sessionIndex?: string;
}

export interface SamlLogoutResult {
  kind: "request" | "response";
  loggedOut: boolean;
  profile: SamlLogoutProfile | null;
}

interface SamlClientOptions {
  forceAuthn?: boolean;
  isPassive?: boolean;
  requestedAuthnContext?: string | null;
  logoutCallbackUrl?: string;
}

export class SAMLHandler implements AuthHandler {
  private appInstance: DecryptedAppInstance;

  constructor(appInstance: DecryptedAppInstance) {
    this.appInstance = appInstance;
  }

  private createSamlClient(
    callbackUrl: string,
    options?: SamlClientOptions,
  ): SAML {
    const hasIdpCert = Boolean(this.appInstance.idpCert?.trim());
    const hasSigningKey =
      this.appInstance.signAuthnRequests &&
      Boolean(this.appInstance.spSigningPrivateKey?.trim()) &&
      Boolean(this.appInstance.spSigningCert?.trim());
    const requestedAuthnContext =
      options && "requestedAuthnContext" in options
        ? (options.requestedAuthnContext ?? null)
        : this.appInstance.requestedAuthnContext;
    const requestedContexts = requestedAuthnContext ? [requestedAuthnContext] : [];

    return new SAML({
      callbackUrl,
      entryPoint: this.appInstance.entryPoint!,
      logoutUrl: this.appInstance.samlLogoutUrl?.trim() || this.appInstance.entryPoint!,
      logoutCallbackUrl: options?.logoutCallbackUrl,
      issuer: this.appInstance.issuer!,
      idpCert: this.appInstance.idpCert!,
      wantAssertionsSigned: hasIdpCert,
      wantAuthnResponseSigned: hasIdpCert,
      forceAuthn: options?.forceAuthn ?? this.appInstance.forceAuthnDefault,
      passive: options?.isPassive ?? this.appInstance.isPassiveDefault,
      identifierFormat: this.appInstance.nameIdFormat || undefined,
      acceptedClockSkewMs: this.appInstance.clockSkewToleranceSeconds * 1000,
      disableRequestedAuthnContext: requestedContexts.length === 0,
      authnContext: requestedContexts,
      decryptionPvk: this.appInstance.spEncryptionPrivateKey?.trim() || undefined,
      privateKey: hasSigningKey ? this.appInstance.spSigningPrivateKey! : undefined,
      publicCert: hasSigningKey ? this.appInstance.spSigningCert! : undefined,
      signatureAlgorithm: hasSigningKey
        ? mapSignatureAlgorithm(this.appInstance.samlSignatureAlgorithm)
        : undefined,
    });
  }

  private normalizeLogoutProfile(profile: Record<string, unknown> | null | undefined) {
    if (!profile || typeof profile.nameID !== "string" || profile.nameID.length === 0) {
      return null;
    }

    return {
      ID: typeof profile.ID === "string" ? profile.ID : undefined,
      issuer: typeof profile.issuer === "string" ? profile.issuer : undefined,
      nameID: profile.nameID,
      nameIDFormat:
        typeof profile.nameIDFormat === "string"
          ? profile.nameIDFormat
          : this.appInstance.nameIdFormat || DEFAULT_NAME_ID_FORMAT,
      nameQualifier:
        typeof profile.nameQualifier === "string" ? profile.nameQualifier : undefined,
      spNameQualifier:
        typeof profile.spNameQualifier === "string" ? profile.spNameQualifier : undefined,
      sessionIndex:
        typeof profile.sessionIndex === "string" ? profile.sessionIndex : undefined,
    } satisfies SamlLogoutProfile;
  }

  async getAuthorizationUrl(
    callbackUrl: string,
    options?: AuthRequestOptions,
  ): Promise<AuthorizationResult> {
    const forceAuthn = normalizeBooleanOverride(
      options?.runtimeOverrides?.forceAuthn,
      this.appInstance.forceAuthnDefault,
    );
    const isPassive = normalizeBooleanOverride(
      options?.runtimeOverrides?.isPassive,
      this.appInstance.isPassiveDefault,
    );
    const requestedAuthnContext = normalizeStringOverride(
      options?.runtimeOverrides?.requestedAuthnContext,
      this.appInstance.requestedAuthnContext,
    );
    const saml = this.createSamlClient(callbackUrl, {
      forceAuthn,
      isPassive,
      requestedAuthnContext,
    });
    const state = randomBytes(32).toString("hex");
    const url = await saml.getAuthorizeUrlAsync(state, "", {});

    return {
      url,
      state,
      outboundParams: {
        forceAuthn: String(forceAuthn),
        isPassive: String(isPassive),
        nameIdFormat: this.appInstance.nameIdFormat || "",
        requestedAuthnContext: requestedAuthnContext || "",
        samlSignatureAlgorithm: this.appInstance.samlSignatureAlgorithm,
        clockSkewToleranceSeconds: String(this.appInstance.clockSkewToleranceSeconds),
      },
    };
  }

  async handleCallback(
    samlResponse: string,
    callbackUrl: string,
  ): Promise<AuthResult> {
    const sanitizedResponse = sanitizeXml(
      Buffer.from(samlResponse, "base64").toString("utf-8"),
    );
    const reSerialized = Buffer.from(sanitizedResponse, "utf-8").toString("base64");

    const saml = this.createSamlClient(callbackUrl);

    const { profile } = await saml.validatePostResponseAsync({
      SAMLResponse: reSerialized,
    });

    const claims: Record<string, unknown> = {};
    if (profile) {
      for (const [key, value] of Object.entries(profile)) {
        if (
          key !== "getAssertionXml" &&
          key !== "getAssertion" &&
          key !== "getSamlResponseXml" &&
          typeof value !== "function"
        ) {
          claims[key] = value;
        }
      }
    }

    let rawXml: string | undefined;
    if (profile?.getSamlResponseXml) {
      rawXml = profile.getSamlResponseXml();
    }

    return {
      slug: this.appInstance.slug,
      protocol: "SAML",
      claims,
      rawXml,
    };
  }

  async buildLogoutUrl(
    callbackUrl: string,
    logoutCallbackUrl: string,
    relayState: string,
    profile: SamlLogoutProfile,
  ): Promise<string | null> {
    if (!this.appInstance.samlLogoutUrl?.trim()) {
      return null;
    }

    const saml = this.createSamlClient(callbackUrl, { logoutCallbackUrl });
    return saml.getLogoutUrlAsync(profile as Profile, relayState, {});
  }

  async buildLogoutResponseUrl(
    callbackUrl: string,
    logoutCallbackUrl: string,
    relayState: string,
    logoutRequestProfile: Record<string, unknown>,
    success: boolean,
  ): Promise<string> {
    const saml = this.createSamlClient(callbackUrl, { logoutCallbackUrl });
    return saml.getLogoutResponseUrlAsync(
      logoutRequestProfile as Profile,
      relayState,
      {},
      success,
    );
  }

  async handleLogoutRedirect(
    requestUrl: string,
    callbackUrl: string,
    logoutCallbackUrl: string,
  ): Promise<SamlLogoutResult> {
    const url = new URL(requestUrl);
    const query = Object.fromEntries(url.searchParams.entries());
    const saml = this.createSamlClient(callbackUrl, { logoutCallbackUrl });
    const result = await saml.validateRedirectAsync(query, url.search.slice(1));

    return {
      kind: url.searchParams.has("SAMLRequest") ? "request" : "response",
      loggedOut: result.loggedOut,
      profile: this.normalizeLogoutProfile((result.profile as Record<string, unknown> | null) ?? null),
    };
  }

  async handleLogoutPost(
    formData: Record<string, string>,
    callbackUrl: string,
    logoutCallbackUrl: string,
  ): Promise<SamlLogoutResult> {
    const saml = this.createSamlClient(callbackUrl, { logoutCallbackUrl });

    if (formData.SAMLRequest) {
      const result = await saml.validatePostRequestAsync({
        SAMLRequest: formData.SAMLRequest,
      });
      return {
        kind: "request",
        loggedOut: result.loggedOut,
        profile: this.normalizeLogoutProfile((result.profile as Record<string, unknown> | null) ?? null),
      };
    }

    if (formData.SAMLResponse) {
      const result = await saml.validatePostResponseAsync({
        SAMLResponse: formData.SAMLResponse,
      });
      return {
        kind: "response",
        loggedOut: result.loggedOut,
        profile: this.normalizeLogoutProfile((result.profile as Record<string, unknown> | null) ?? null),
      };
    }

    throw new Error("Missing SAML logout payload");
  }
}
const DEFAULT_NAME_ID_FORMAT =
  "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified";
