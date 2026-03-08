import { redirect } from "next/navigation";
import Link from "next/link";
import { getActiveAuthRun } from "@/lib/session";
import { Tabs } from "@/components/ui/Tabs";
import { ClaimsTable } from "@/components/inspector/ClaimsTable";
import { RawPayloadView } from "@/components/inspector/RawPayloadView";
import { JWTDecoder } from "@/components/inspector/JWTDecoder";
import { SessionInfo } from "@/components/inspector/SessionInfo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { PageHeader } from "@/components/layout/PageHeader";
import { getAppInstanceBySlug } from "@/repositories/app-instance.repo";
import { listAuthRunEvents } from "@/repositories/auth-run.repo";
import { OIDCHandler } from "@/lib/oidc-handler";
import { DiscoveryMetadataView } from "@/components/inspector/DiscoveryMetadataView";
import { LifecyclePanel } from "@/components/inspector/LifecyclePanel";
import { OidcTokenValidationPanel } from "@/components/inspector/OidcTokenValidationPanel";
import { SamlOverviewPanel } from "@/components/inspector/SamlOverviewPanel";
import { UserInfoPanel } from "@/components/inspector/UserInfoPanel";

export default async function InspectorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [run, app] = await Promise.all([
    getActiveAuthRun(slug),
    getAppInstanceBySlug(slug),
  ]);

  if (!run || !app) {
    redirect(`/test/${slug}`);
  }
  const events = await listAuthRunEvents(run.id);

  const discoveryMetadata =
    run.protocol === "OIDC"
      ? await new OIDCHandler(app).getDiscoveryMetadata().catch(() => ({}))
      : null;
  const hasRpLogout =
    Boolean(run.idToken) &&
    Boolean(
      discoveryMetadata &&
        typeof discoveryMetadata === "object" &&
        "end_session_endpoint" in discoveryMetadata,
    );
  const jwksUri =
    discoveryMetadata &&
    typeof discoveryMetadata === "object" &&
    "jwks_uri" in discoveryMetadata &&
    typeof discoveryMetadata.jwks_uri === "string"
      ? discoveryMetadata.jwks_uri
      : null;
  const authenticatedEvent = events.find((event) => event.type === "AUTHENTICATED");
  const expectedCHash =
    authenticatedEvent &&
    authenticatedEvent.metadata &&
    typeof authenticatedEvent.metadata === "object" &&
    !Array.isArray(authenticatedEvent.metadata) &&
    typeof authenticatedEvent.metadata.expectedCHash === "string"
      ? authenticatedEvent.metadata.expectedCHash
      : null;
  const tabs =
    run.protocol === "OIDC"
      ? [
          {
            label: "Lifecycle",
            content: (
              <LifecyclePanel
                slug={slug}
                grantType={run.grantType}
                claims={run.claims}
                accessTokenExpiresAt={run.accessTokenExpiresAt?.toISOString() ?? null}
                hasRefreshToken={Boolean(run.refreshToken)}
                lastIntrospection={run.lastIntrospection}
                lastRevocationAt={run.lastRevocationAt?.toISOString() ?? null}
                events={events.map((event) => ({
                  id: event.id,
                  type: event.type,
                  status: event.status,
                  request: event.request,
                  response: event.response,
                  metadata: event.metadata,
                  occurredAt: event.occurredAt.toISOString(),
                }))}
              />
            ),
          },
          {
            label: "Claims",
            content: <ClaimsTable claims={run.claims || {}} />,
          },
        ]
      : [
          {
            label: "Overview",
            content: (
              <SamlOverviewPanel
                claims={run.claims}
                hasRawXml={Boolean(run.rawSamlResponseXml)}
              />
            ),
          },
          {
            label: "Claims",
            content: <ClaimsTable claims={run.claims || {}} />,
          },
        ];

  if (run.protocol === "OIDC" && discoveryMetadata) {
    tabs.push({
      label: "Discovery",
      content: <DiscoveryMetadataView metadata={discoveryMetadata} />,
    });
  }
  if (run.protocol === "OIDC") {
    if (run.idToken) {
      tabs.push({
        label: "Validation",
        content: (
          <OidcTokenValidationPanel
            idToken={run.idToken}
            accessToken={run.accessToken}
            jwksUri={jwksUri}
            expectedCHash={expectedCHash}
            grantType={run.grantType}
          />
        ),
      });
    }
    tabs.push({
      label: "UserInfo",
      content: (
        <UserInfoPanel
          slug={slug}
          initialUserInfo={run.userinfo}
          idTokenClaims={run.claims}
        />
      ),
    });
  }

  if (run.protocol === "OIDC" && run.rawTokenResponse) {
    tabs.push({
      label: "Raw Token",
      content: <RawPayloadView data={run.rawTokenResponse} format="json" />,
    });
  }
  if (run.protocol === "SAML" && run.rawSamlResponseXml) {
    tabs.push({
      label: "Raw XML",
      content: <RawPayloadView data={run.rawSamlResponseXml} format="xml" />,
    });
  }

  if (run.protocol === "OIDC" && run.idToken) {
    tabs.push({
      label: "JWT Decoder",
      content: <JWTDecoder token={run.idToken} />,
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-3 sm:px-6 lg:px-8 animate-enter">
      <PageHeader
        title="Auth Inspector"
        description={
          run.protocol === "OIDC"
            ? "Review claims, discovery, raw payloads, and logout diagnostics."
            : "Review captured SAML claims, assertion payloads, and current protocol diagnostics."
        }
        actions={
          <>
            <ThemeToggle compact />
            <Link href="/" className="text-sm font-medium text-[var(--primary)] hover:underline">
              Back to Dashboard
            </Link>
          </>
        }
      />

      <SessionInfo
        slug={slug}
        protocol={run.protocol}
        runId={run.id}
        authenticatedAt={run.authenticatedAt?.toISOString() ?? run.createdAt.toISOString()}
        nonceStatus={run.nonceStatus}
        hasRpLogout={hasRpLogout}
      />

      <Tabs tabs={tabs} appearance="pill" compact />
    </div>
  );
}
