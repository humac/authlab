import { notFound } from "next/navigation";
import Link from "next/link";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

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

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const testUrl = `${appUrl}/test/${app.slug}`;
  const testLoginUrl = `${testUrl}/login`;
  const testInspectorUrl = `${testUrl}/inspector`;
  const oidcCallbackUrl = `${appUrl}/api/auth/callback/oidc/${app.slug}`;
  const samlCallbackUrl = `${appUrl}/api/auth/callback/saml/${app.slug}`;
  const unsignedMetadataUrl =
    app.protocol === "SAML" ? `${appUrl}/api/saml/metadata/${app.slug}` : null;
  const signedMetadataUrl =
    app.protocol === "SAML"
      ? `${appUrl}/api/saml/metadata/${app.slug}?signed=true`
      : null;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center px-4 py-8">
      <div className="mb-4 flex justify-end">
        <ThemeToggle compact />
      </div>

      <Card className="animate-enter text-center">
        <Badge variant={app.protocol.toLowerCase() as "oidc" | "saml"} className="mx-auto" />
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text)]">{app.name}</h1>
        <p className="mb-6 text-sm text-[var(--muted)]">Test {app.protocol} authentication flow</p>

        <Link href={`/test/${slug}/login`}>
          <button
            className="focus-ring w-full rounded-xl px-6 py-3 text-lg font-semibold text-white shadow-[var(--shadow-sm)] transition-opacity hover:opacity-90"
            style={{ backgroundColor: app.buttonColor || "#3B71CA" }}
          >
            Login with {app.protocol}
          </button>
        </Link>

        <Link href="/" className="mt-3 inline-block text-sm font-medium text-[var(--primary)] hover:underline">
          Back to Dashboard
        </Link>

        <div className="mt-6 border-t border-[var(--border)] pt-4 text-left">
          <h2 className="text-sm font-semibold text-[var(--text)]">Important URLs</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Use the same values shown during app creation when configuring your identity provider.
          </p>
          <dl className="mt-3 space-y-3">
            <div>
              <dt className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Test URL</dt>
              <code className="block break-all rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text)]">
                {testUrl}
              </code>
              <div className="mt-1 flex items-center gap-3">
                <CopyButton text={testUrl} />
              </div>
            </div>
            <div>
              <dt className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Test Login URL</dt>
              <code className="block break-all rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text)]">
                {testLoginUrl}
              </code>
              <div className="mt-1 flex items-center gap-3">
                <CopyButton text={testLoginUrl} />
              </div>
            </div>
            {app.protocol === "OIDC" ? (
              <div>
                <dt className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--muted)]">OIDC Redirect URI</dt>
                <code className="block break-all rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text)]">
                  {oidcCallbackUrl}
                </code>
                <div className="mt-1 flex items-center gap-3">
                  <CopyButton text={oidcCallbackUrl} />
                </div>
              </div>
            ) : (
              <>
                <div>
                  <dt className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--muted)]">SAML ACS URL (Callback)</dt>
                  <code className="block break-all rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text)]">
                    {samlCallbackUrl}
                  </code>
                  <div className="mt-1 flex items-center gap-3">
                    <CopyButton text={samlCallbackUrl} />
                  </div>
                </div>
                {unsignedMetadataUrl && (
                  <div>
                    <dt className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--muted)]">SAML SP Metadata URL</dt>
                    <code className="block break-all rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text)]">
                      {unsignedMetadataUrl}
                    </code>
                    <div className="mt-1 flex items-center gap-3">
                      <CopyButton text={unsignedMetadataUrl} />
                      <a href={unsignedMetadataUrl} className="text-xs text-[var(--primary)] hover:underline">
                        Download
                      </a>
                    </div>
                  </div>
                )}
              </>
            )}
            <div>
              <dt className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Inspector URL (after successful login)</dt>
              <code className="block break-all rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text)]">
                {testInspectorUrl}
              </code>
              <div className="mt-1 flex items-center gap-3">
                <CopyButton text={testInspectorUrl} />
              </div>
            </div>
          </dl>

          {app.protocol === "SAML" && signedMetadataUrl && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <p className="mb-1 text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Optional signed metadata URL</p>
              <code className="block break-all rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)]">
                {signedMetadataUrl}
              </code>
              <div className="mt-1 flex items-center gap-3">
                <CopyButton text={signedMetadataUrl} />
                <a href={signedMetadataUrl} className="text-xs text-[var(--primary)] hover:underline">
                  Download
                </a>
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Signed metadata requires both <code>SAML_SP_PRIVATE_KEY</code> and <code>SAML_SP_PUBLIC_CERT</code> environment variables.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
