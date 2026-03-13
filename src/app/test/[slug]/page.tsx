import { notFound } from "next/navigation";
import Link from "next/link";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { PageHeader } from "@/components/layout/PageHeader";
import { RuntimeLaunchPanel } from "@/components/apps/RuntimeLaunchPanel";
import { DiscoveryMetadataView } from "@/components/inspector/DiscoveryMetadataView";
import { getReadableTextColor } from "@/lib/color";
import { OIDCHandler } from "@/lib/oidc-handler";
import { getActiveAuthRun } from "@/lib/session";

export default async function TestPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [app, activeRun] = await Promise.all([
    getAppInstanceBySlug(slug),
    getActiveAuthRun(slug),
  ]);

  if (!app) {
    notFound();
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const testUrl = `${appUrl}/test/${app.slug}`;
  const testLoginUrl = `${testUrl}/login`;
  const testInspectorUrl = `${testUrl}/inspector`;
  const clientCredentialsUrl = `${appUrl}/api/auth/token/client-credentials/${app.slug}`;
  const deviceAuthorizationUrl = `${appUrl}/api/auth/device/${app.slug}`;
  const tokenExchangeUrl = `${appUrl}/api/auth/token/exchange/${app.slug}`;
  const oidcCallbackUrl = `${appUrl}/api/auth/callback/oidc/${app.slug}`;
  const oidcFrontchannelLogoutUrl = `${appUrl}/api/auth/frontchannel-logout/${app.slug}`;
  const oidcBackchannelLogoutUrl = `${appUrl}/api/auth/backchannel-logout/${app.slug}`;
  const samlCallbackUrl = `${appUrl}/api/auth/callback/saml/${app.slug}`;
  const samlLogoutCallbackUrl = `${appUrl}/api/auth/logout/saml/${app.slug}/callback`;
  const scimBaseUrl = `${appUrl}/api/scim/${app.slug}`;
  const scimUsersUrl = `${scimBaseUrl}/Users`;
  const scimGroupsUrl = `${scimBaseUrl}/Groups`;
  const scimConfigUrl = `${scimBaseUrl}/ServiceProviderConfig`;
  const unsignedMetadataUrl =
    app.protocol === "SAML" ? `${appUrl}/api/saml/metadata/${app.slug}` : null;
  const signedMetadataUrl =
    app.protocol === "SAML"
      ? `${appUrl}/api/saml/metadata/${app.slug}?signed=true`
      : null;
  const discoveryMetadata =
    app.protocol === "OIDC"
      ? await new OIDCHandler(app).getDiscoveryMetadata().catch(() => ({}))
      : null;
  const launchButtonColor = app.buttonColor || "#3B71CA";
  const launchButtonTextColor = getReadableTextColor(launchButtonColor);
  const hasDeviceAuthorization =
    discoveryMetadata !== null &&
    typeof discoveryMetadata === "object" &&
    "device_authorization_endpoint" in discoveryMetadata &&
    typeof discoveryMetadata.device_authorization_endpoint === "string";
  const hasParSupport =
    discoveryMetadata !== null &&
    typeof discoveryMetadata === "object" &&
    "pushed_authorization_request_endpoint" in discoveryMetadata &&
    typeof discoveryMetadata.pushed_authorization_request_endpoint === "string";

  const importantUrls = [
    ["Test URL", testUrl],
    ["Test Login URL", testLoginUrl],
    [
      app.protocol === "OIDC" ? "OIDC Redirect URI" : "SAML ACS URL",
      app.protocol === "OIDC" ? oidcCallbackUrl : samlCallbackUrl,
    ],
    ...(app.protocol === "OIDC" ? [["OIDC Front-channel Logout URI", oidcFrontchannelLogoutUrl]] : []),
    ...(app.protocol === "OIDC" ? [["OIDC Back-channel Logout URI", oidcBackchannelLogoutUrl]] : []),
    ["Inspector URL", testInspectorUrl],
    ["SCIM Base URL", scimBaseUrl],
    ["SCIM Users URL", scimUsersUrl],
    ["SCIM Groups URL", scimGroupsUrl],
    ["SCIM ServiceProviderConfig", scimConfigUrl],
    ...(unsignedMetadataUrl ? [["SP Metadata URL", unsignedMetadataUrl]] : []),
    ...(signedMetadataUrl ? [["Signed Metadata URL", signedMetadataUrl]] : []),
    ...(app.protocol === "SAML" ? [["SAML SLO Callback URL", samlLogoutCallbackUrl]] : []),
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-3 sm:px-6 lg:px-8 animate-enter">
      <PageHeader
        title={app.name}
        description={`Launch and inspect ${app.protocol} authentication with compact runtime controls.`}
        actions={
          <>
            <ThemeToggle compact />
            <Link href="/" className="text-sm font-medium text-[var(--primary)] hover:underline">
              Back to Dashboard
            </Link>
          </>
        }
      >
        <Badge variant={app.protocol.toLowerCase() as "oidc" | "saml"} />
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              Primary action
            </p>
            <a
              href={testLoginUrl}
              className="mt-2 inline-flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{
                backgroundColor: launchButtonColor,
                color: launchButtonTextColor,
              }}
            >
              {app.protocol === "OIDC" ? "Browser Login" : `Login with ${app.protocol}`}
            </a>
          </div>

          <RuntimeLaunchPanel
            protocol={app.protocol}
            loginUrl={testLoginUrl}
            clientCredentialsUrl={app.protocol === "OIDC" ? clientCredentialsUrl : undefined}
            deviceAuthorizationUrl={
              app.protocol === "OIDC" && hasDeviceAuthorization
                ? deviceAuthorizationUrl
                : undefined
            }
            tokenExchangeUrl={app.protocol === "OIDC" ? tokenExchangeUrl : undefined}
            hasActiveAccessToken={app.protocol === "OIDC" ? Boolean(activeRun?.accessToken) : false}
            hasActiveIdToken={app.protocol === "OIDC" ? Boolean(activeRun?.idToken) : false}
            savedCustomParams={app.customAuthParams}
            defaultScopes={app.scopes || "openid profile email"}
            pkceMode={app.protocol === "OIDC" ? app.pkceMode : undefined}
            usePar={app.protocol === "OIDC" ? app.usePar : undefined}
            parSupported={app.protocol === "OIDC" ? hasParSupport : undefined}
            forceAuthnDefault={app.forceAuthnDefault}
            isPassiveDefault={app.isPassiveDefault}
            requestedAuthnContextDefault={app.requestedAuthnContext}
            samlSignatureAlgorithm={app.protocol === "SAML" ? app.samlSignatureAlgorithm : undefined}
            clockSkewToleranceSeconds={app.protocol === "SAML" ? app.clockSkewToleranceSeconds : undefined}
            samlLogoutUrl={app.protocol === "SAML" ? app.samlLogoutUrl : undefined}
            isPublicClient={app.protocol === "OIDC" && !app.clientSecret}
          />
        </Card>

        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                  Important URLs
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Use these values when configuring the identity provider.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {importantUrls.map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"
                >
                  <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                    {label}
                  </p>
                  <code className="mt-2 block break-all rounded-md bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)]">
                    {value}
                  </code>
                  <div className="mt-2 flex items-center gap-2">
                    <CopyButton text={value} />
                    {label.includes("Metadata") && (
                      <a href={value} className="text-xs font-medium text-[var(--primary)] hover:underline">
                        Download
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {app.protocol === "OIDC" && discoveryMetadata && (
            <Card>
              <div className="mb-3">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                  Discovery metadata
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Current OIDC server capabilities from provider discovery.
                </p>
              </div>
              <DiscoveryMetadataView metadata={discoveryMetadata} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
