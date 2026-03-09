import { notFound } from "next/navigation";
import { getRedactedAppInstanceById } from "@/repositories/app-instance.repo";
import { requireUser } from "@/lib/user-session";
import { getTeamMembership } from "@/repositories/team.repo";
import { EditAppForm } from "@/components/apps/EditAppForm";
import { deriveScimBearerToken, buildScimBaseUrl } from "@/lib/scim";
import {
  listScimRequestLogs,
  listScimResources,
} from "@/repositories/scim.repo";
import { ScimProvisioningPanel } from "@/components/apps/ScimProvisioningPanel";

export default async function EditAppPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const app = await getRedactedAppInstanceById(id);

  if (!app) {
    notFound();
  }

  const membership = await getTeamMembership(user.userId, app.teamId);
  if (!membership) {
    notFound();
  }

  const [users, groups, logs] = await Promise.all([
    listScimResources(app.id, "USER"),
    listScimResources(app.id, "GROUP"),
    listScimRequestLogs(app.id, 10),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 animate-enter">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">Edit {app.name}</h1>
        <p className="text-sm text-[var(--muted)]">Adjust provider settings and test UI behavior.</p>
      </div>
      <EditAppForm app={app} />
      <ScimProvisioningPanel
        baseUrl={buildScimBaseUrl(app.slug)}
        bearerToken={deriveScimBearerToken(app.id)}
        users={users}
        groups={groups}
        logs={logs}
      />
    </div>
  );
}
