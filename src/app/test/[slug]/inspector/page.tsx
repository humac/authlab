import { redirect } from "next/navigation";
import { getAppSession } from "@/lib/session";
import { Tabs } from "@/components/ui/Tabs";
import { ClaimsTable } from "@/components/inspector/ClaimsTable";
import { RawPayloadView } from "@/components/inspector/RawPayloadView";
import { JWTDecoder } from "@/components/inspector/JWTDecoder";
import { SessionInfo } from "@/components/inspector/SessionInfo";

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

  // Raw data tab
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

  // JWT decoder (OIDC only)
  if (session.protocol === "OIDC" && session.idToken) {
    tabs.push({
      label: "JWT Decoder",
      content: <JWTDecoder token={session.idToken} />,
    });
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">
        Auth Inspector
      </h1>

      <SessionInfo
        slug={slug}
        protocol={session.protocol}
        authenticatedAt={session.authenticatedAt}
      />

      <div className="mt-6">
        <Tabs tabs={tabs} />
      </div>
    </div>
  );
}
