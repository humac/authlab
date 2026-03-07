import { SAML } from "@node-saml/node-saml";
import { randomBytes } from "crypto";
import type { DecryptedAppInstance } from "@/types/app-instance";
import type { AuthHandler, AuthorizationResult, AuthResult } from "./auth-factory";
import { sanitizeXml } from "./xxe-sanitizer";

export class SAMLHandler implements AuthHandler {
  private appInstance: DecryptedAppInstance;

  constructor(appInstance: DecryptedAppInstance) {
    this.appInstance = appInstance;
  }

  private createSamlClient(callbackUrl: string): SAML {
    const hasIdpCert = Boolean(this.appInstance.idpCert?.trim());

    return new SAML({
      callbackUrl,
      entryPoint: this.appInstance.entryPoint!,
      issuer: this.appInstance.issuer!,
      idpCert: this.appInstance.idpCert!,
      wantAssertionsSigned: hasIdpCert,
      wantAuthnResponseSigned: hasIdpCert,
    });
  }

  async getAuthorizationUrl(callbackUrl: string): Promise<AuthorizationResult> {
    const saml = this.createSamlClient(callbackUrl);
    const state = randomBytes(32).toString("hex");

    const url = await saml.getAuthorizeUrlAsync(state, "", {});

    return { url, state };
  }

  async handleCallback(
    samlResponse: string,
    callbackUrl: string,
  ): Promise<AuthResult> {
    // Sanitize XML before processing
    const sanitizedResponse = sanitizeXml(
      Buffer.from(samlResponse, "base64").toString("utf-8"),
    );
    const reSerialized = Buffer.from(sanitizedResponse, "utf-8").toString("base64");

    const saml = this.createSamlClient(callbackUrl);

    const { profile } = await saml.validatePostResponseAsync({
      SAMLResponse: reSerialized,
    });

    // Extract claims from profile
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

    // Get raw XML if available
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
