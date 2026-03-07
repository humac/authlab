import { SAML } from "@node-saml/node-saml";
import { randomBytes } from "crypto";
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

export class SAMLHandler implements AuthHandler {
  private appInstance: DecryptedAppInstance;

  constructor(appInstance: DecryptedAppInstance) {
    this.appInstance = appInstance;
  }

  private createSamlClient(
    callbackUrl: string,
    options?: { forceAuthn?: boolean; isPassive?: boolean },
  ): SAML {
    const hasIdpCert = Boolean(this.appInstance.idpCert?.trim());
    const hasSigningKey =
      this.appInstance.signAuthnRequests &&
      Boolean(this.appInstance.spSigningPrivateKey?.trim()) &&
      Boolean(this.appInstance.spSigningCert?.trim());

    return new SAML({
      callbackUrl,
      entryPoint: this.appInstance.entryPoint!,
      issuer: this.appInstance.issuer!,
      idpCert: this.appInstance.idpCert!,
      wantAssertionsSigned: hasIdpCert,
      wantAuthnResponseSigned: hasIdpCert,
      forceAuthn: options?.forceAuthn ?? this.appInstance.forceAuthnDefault,
      passive: options?.isPassive ?? this.appInstance.isPassiveDefault,
      identifierFormat: this.appInstance.nameIdFormat || undefined,
      privateKey: hasSigningKey ? this.appInstance.spSigningPrivateKey! : undefined,
      publicCert: hasSigningKey ? this.appInstance.spSigningCert! : undefined,
      signatureAlgorithm: hasSigningKey ? "sha256" : undefined,
    });
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
    const saml = this.createSamlClient(callbackUrl, { forceAuthn, isPassive });
    const state = randomBytes(32).toString("hex");
    const url = await saml.getAuthorizeUrlAsync(state, "", {});

    return {
      url,
      state,
      outboundParams: {
        forceAuthn: String(forceAuthn),
        isPassive: String(isPassive),
        nameIdFormat: this.appInstance.nameIdFormat || "",
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
}
