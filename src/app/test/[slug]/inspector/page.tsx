import { redirect } from "next/navigation";
import Link from "next/link";
import { getAppSession } from "@/lib/session";
import { Tabs } from "@/components/ui/Tabs";
import { ClaimsTable } from "@/components/inspector/ClaimsTable";
import { RawPayloadView } from "@/components/inspector/RawPayloadView";
import { JWTDecoder } from "@/components/inspector/JWTDecoder";
import { SessionInfo } from "@/components/inspector/SessionInfo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export default async function InspectorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getAppSession(slug);

  if (!session.appSlug) {
    redirect(`/test/${slug}`);
  }

  const tabs = [
    {
      label: "Claims",
      content: <ClaimsTable claims={session.claims || {}} />,
    },
  ];

  if (session.protocol === "OIDC" && session.rawToken) {
    tabs.push({
      label: "Raw Token",
      content: <RawPayloadView data={session.rawToken} format="json" />,
    });
  }
  if (session.protocol === "SAML" && session.rawXml) {
    tabs.push({
      label: "Raw XML",
      content: <RawPayloadView data={session.rawXml} format="xml" />,
    });
  }

  if (session.protocol === "OIDC" && session.idToken) {
    tabs.push({
      label: "JWT Decoder",
      content: <JWTDecoder token={session.idToken} />,
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 animate-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">Auth Inspector</h1>
          <p className="text-sm text-[var(--muted)]">Inspect claims, tokens, and session context</p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle compact />
          <Link href="/" className="text-sm font-medium text-[var(--primary)] hover:underline">
            Back to Dashboard
          </Link>
        </div>
      </div>

      <SessionInfo
        slug={slug}
        protocol={session.protocol}
        authenticatedAt={session.authenticatedAt}
      />

      <Tabs tabs={tabs} appearance="pill" />
    </div>
  );
}
