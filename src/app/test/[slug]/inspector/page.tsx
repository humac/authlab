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
import { getAuthRunById, listAuthRunEvents, listAuthRunsForApp } from "@/repositories/auth-run.repo";
import { OIDCHandler } from "@/lib/oidc-handler";
import { buildAuthTraceEntries } from "@/lib/auth-trace";
import { DiscoveryMetadataView } from "@/components/inspector/DiscoveryMetadataView";
import { LifecyclePanel } from "@/components/inspector/LifecyclePanel";
import { OidcTokenValidationPanel } from "@/components/inspector/OidcTokenValidationPanel";
import { SamlOverviewPanel } from "@/components/inspector/SamlOverviewPanel";
import { TracePanel } from "@/components/inspector/TracePanel";
import { UserInfoPanel } from "@/components/inspector/UserInfoPanel";
import { getLatestDeviceAuthorizationSnapshot } from "@/lib/oidc-device-flow";
import { parseSamlResponseXml } from "@/lib/saml-response-parser";
import { getSamlLogoutProfileFromRun } from "@/lib/saml-logout";
import { ClaimsDiffPanel } from "@/components/inspector/ClaimsDiffPanel";
import { SamlSignaturePanel } from "@/components/inspector/SamlSignaturePanel";
import { CertificateHealthPanel } from "@/components/inspector/CertificateHealthPanel";
import { ProtocolCompliancePanel } from "@/components/inspector/ProtocolCompliancePanel";
import { analyzeSamlSignatureDiagnostics } from "@/lib/saml-signature-diagnostics";
import { analyzeCertificatePem } from "@/lib/certificate-diagnostics";
import {
  buildOidcComplianceReport,
  buildSamlComplianceReport,
} from "@/lib/protocol-compliance";

export default async function InspectorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ compare?: string }>;
}) {
  const { slug } = await params;
  const { compare } = await searchParams;
  const [run, app] = await Promise.all([
    getActiveAuthRun(slug),
    getAppInstanceBySlug(slug),
  ]);

  if (!run || !app) {
    redirect(`/test/${slug}`);
  }
  const [events, comparableRuns] = await Promise.all([
    listAuthRunEvents(run.id),
    listAuthRunsForApp(run.appInstanceId, run.protocol, 12),
  ]);
  const compareCandidates = comparableRuns.filter((candidate) => candidate.id !== run.id);
  const selectedCompareRun =
    compare && compare !== run.id
      ? await getAuthRunById(compare)
      : null;
  const compareRun =
    selectedCompareRun &&
    selectedCompareRun.appInstanceId === run.appInstanceId &&
    selectedCompareRun.protocol === run.protocol
      ? selectedCompareRun
      : null;

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
  const samlAssertion =
    run.protocol === "SAML" && run.rawSamlResponseXml
      ? await parseSamlResponseXml(run.rawSamlResponseXml)
      : null;
  const samlSignatureDiagnostics =
    run.protocol === "SAML"
      ? await analyzeSamlSignatureDiagnostics({
          xml: run.rawSamlResponseXml,
          configuredIdpCert: app.idpCert,
          callbackValidated: run.status === "AUTHENTICATED",
        })
      : null;
  const samlCertificateDiagnostics =
    run.protocol === "SAML" ? analyzeCertificatePem(app.idpCert) : null;
  const hasSamlLogout =
    run.protocol === "SAML" &&
    Boolean(app.samlLogoutUrl) &&
    Boolean(getSamlLogoutProfileFromRun(run));
  const deviceAuthorization =
    run.protocol === "OIDC" && run.grantType === "DEVICE_AUTHORIZATION"
      ? getLatestDeviceAuthorizationSnapshot(events)
      : null;
  const traceEntries = buildAuthTraceEntries({
    run,
    events,
    oidcAuthorizationEndpoint:
      discoveryMetadata &&
      typeof discoveryMetadata === "object" &&
      "authorization_endpoint" in discoveryMetadata &&
      typeof discoveryMetadata.authorization_endpoint === "string"
        ? discoveryMetadata.authorization_endpoint
        : null,
    samlEntryPoint: app.protocol === "SAML" ? app.entryPoint : null,
  });
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const complianceReport =
    run.protocol === "OIDC"
      ? buildOidcComplianceReport({
          app,
          run,
          discoveryMetadata,
          frontChannelLogoutUrl: `${appUrl}/api/auth/frontchannel-logout/${slug}`,
          backChannelLogoutUrl: `${appUrl}/api/auth/backchannel-logout/${slug}`,
        })
      : buildSamlComplianceReport({
          app,
          run,
          assertion: samlAssertion,
          signature: samlSignatureDiagnostics!,
          certificate: samlCertificateDiagnostics!,
        });
  const tabs =
    run.protocol === "OIDC"
      ? [
          {
            label: "Lifecycle",
            content: (
              <LifecyclePanel
                slug={slug}
                status={run.status}
                grantType={run.grantType}
                claims={run.claims}
                accessTokenExpiresAt={run.accessTokenExpiresAt?.toISOString() ?? null}
                hasRefreshToken={Boolean(run.refreshToken)}
                lastIntrospection={run.lastIntrospection}
                lastRevocationAt={run.lastRevocationAt?.toISOString() ?? null}
                deviceAuthorization={deviceAuthorization}
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
          {
            label: "Claims Diff",
            content: (
              <ClaimsDiffPanel
                slug={slug}
                currentRun={run}
                compareRun={compareRun}
                candidates={compareCandidates}
              />
            ),
          },
          {
            label: "Trace",
            content: <TracePanel entries={traceEntries} />,
          },
          {
            label: "Compliance",
            content: <ProtocolCompliancePanel report={complianceReport} />,
          },
        ]
      : [
          {
            label: "Assertion",
            content: (
              <SamlOverviewPanel
                assertion={samlAssertion}
                claims={run.claims}
                hasRawXml={Boolean(run.rawSamlResponseXml)}
                outboundAuthParams={run.outboundAuthParams}
              />
            ),
          },
          {
            label: "Claims",
            content: <ClaimsTable claims={run.claims || {}} />,
          },
          {
            label: "Claims Diff",
            content: (
              <ClaimsDiffPanel
                slug={slug}
                currentRun={run}
                compareRun={compareRun}
                candidates={compareCandidates}
              />
            ),
          },
          {
            label: "Trace",
            content: <TracePanel entries={traceEntries} />,
          },
          {
            label: "Signature",
            content: <SamlSignaturePanel diagnostics={samlSignatureDiagnostics!} />,
          },
          {
            label: "Certificate",
            content: (
              <CertificateHealthPanel
                title="IdP signing certificate"
                diagnostics={samlCertificateDiagnostics!}
              />
            ),
          },
          {
            label: "Compliance",
            content: <ProtocolCompliancePanel report={complianceReport} />,
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
            : "Review structured assertion diagnostics, claims, and captured SAML payloads."
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
        status={run.status}
        runId={run.id}
        authenticatedAt={run.authenticatedAt?.toISOString() ?? run.createdAt.toISOString()}
        nonceStatus={run.nonceStatus}
        hasRpLogout={hasRpLogout}
        hasSamlLogout={hasSamlLogout}
      />

      <Tabs tabs={tabs} appearance="pill" compact />
    </div>
  );
}
