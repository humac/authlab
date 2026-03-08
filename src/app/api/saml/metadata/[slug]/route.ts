import { NextResponse } from "next/server";
import { generateServiceProviderMetadata } from "@node-saml/node-saml";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const app = await getAppInstanceBySlug(slug);

  if (!app || app.protocol !== "SAML") {
    return NextResponse.json({ error: "SAML app not found" }, { status: 404 });
  }

  if (!app.issuer) {
    return NextResponse.json(
      { error: "SAML app is missing SP Entity ID (issuer)" },
      { status: 400 },
    );
  }

  const signed = new URL(request.url).searchParams.get("signed") === "true";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const callbackUrl = `${appUrl}/api/auth/callback/saml/${slug}`;

  try {
    const metadata = signed
      ? (() => {
          const privateKey = app.spSigningPrivateKey;
          const publicCert = app.spSigningCert;
          if (!privateKey || !publicCert) {
            throw new Error(
              "Signed metadata requires an app-level SAML signing private key and certificate.",
            );
          }
          return generateServiceProviderMetadata({
            issuer: app.issuer!,
            callbackUrl,
            signMetadata: true,
            identifierFormat: app.nameIdFormat || undefined,
            signatureAlgorithm: "sha256",
            privateKey: privateKey.trim(),
            publicCerts: publicCert.trim(),
          });
        })()
      : generateServiceProviderMetadata({
          issuer: app.issuer!,
          callbackUrl,
          identifierFormat: app.nameIdFormat || undefined,
        });

    const filename = `${slug}-sp-metadata${signed ? "-signed" : ""}.xml`;
    return new NextResponse(metadata, {
      status: 200,
      headers: {
        "Content-Type": "application/samlmetadata+xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("GET /api/saml/metadata/[slug] failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
