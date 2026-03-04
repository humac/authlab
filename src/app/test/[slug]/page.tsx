import { notFound } from "next/navigation";
import Link from "next/link";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { getAppUrl } from "@/lib/app-url";

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

  const callbackType = app.protocol === "OIDC" ? "oidc" : "saml";
  const callbackUrl = `${getAppUrl()}/api/auth/callback/${callbackType}`;

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

        <div className="mt-6 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-1">Callback URL</p>
          <code className="text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded break-all">
            {callbackUrl}
          </code>
          <p className="text-xs text-gray-400 mt-3">
            Register this URL as the redirect URI in your IdP configuration.
          </p>
        </div>
      </Card>
    </div>
  );
}
