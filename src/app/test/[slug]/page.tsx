import { notFound } from "next/navigation";
import Link from "next/link";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";

export default async function TestPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const app = await getAppInstanceBySlug(slug);

  if (!app) {
    notFound();
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const callbackType = app.protocol === "OIDC" ? "oidc" : "saml";
  const callbackUrl = `${appUrl}/api/auth/callback/${callbackType}`;
  const unsignedMetadataUrl =
    app.protocol === "SAML" ? `${appUrl}/api/saml/metadata/${slug}` : null;
  const signedMetadataUrl =
    app.protocol === "SAML"
      ? `${appUrl}/api/saml/metadata/${slug}?signed=true`
      : null;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full text-center">
        <Badge variant={app.protocol.toLowerCase() as "oidc" | "saml"} />
        <h1 className="text-2xl font-bold text-gray-900 mt-3 mb-2">
          {app.name}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Test {app.protocol} authentication flow
        </p>

        <Link href={`/test/${slug}/login`}>
          <button
            className="w-full py-3 px-6 rounded-lg text-white font-medium text-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: app.buttonColor || "#3B71CA" }}
          >
            Login with {app.protocol}
          </button>
        </Link>

        <Link
          href="/"
          className="mt-3 inline-block text-sm text-primary hover:underline"
        >
          Back to Dashboard
        </Link>

        <div className="mt-6 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-1">Callback URL</p>
          <code className="text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded break-all">
            {callbackUrl}
          </code>
          <p className="text-xs text-gray-400 mt-3">
            Register this URL as the redirect URI in your IdP configuration.
          </p>

          {app.protocol === "SAML" && unsignedMetadataUrl && signedMetadataUrl && (
            <div className="mt-4 space-y-3 text-left">
              <div>
                <p className="text-xs text-gray-400 mb-1">SP Metadata URL (Unsigned)</p>
                <code className="block text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded break-all">
                  {unsignedMetadataUrl}
                </code>
                <div className="flex items-center gap-3 mt-1">
                  <CopyButton text={unsignedMetadataUrl} />
                  <a
                    href={unsignedMetadataUrl}
                    className="text-xs text-primary hover:underline"
                  >
                    Download
                  </a>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">SP Metadata URL (Signed)</p>
                <code className="block text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded break-all">
                  {signedMetadataUrl}
                </code>
                <div className="flex items-center gap-3 mt-1">
                  <CopyButton text={signedMetadataUrl} />
                  <a
                    href={signedMetadataUrl}
                    className="text-xs text-primary hover:underline"
                  >
                    Download
                  </a>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Signed metadata requires both <code>SAML_SP_PRIVATE_KEY</code> and{" "}
                <code>SAML_SP_PUBLIC_CERT</code> environment variables.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
