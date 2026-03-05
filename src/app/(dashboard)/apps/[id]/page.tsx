import { notFound } from "next/navigation";
import { getRedactedAppInstanceById } from "@/repositories/app-instance.repo";
import { requireUser } from "@/lib/user-session";
import { getTeamMembership } from "@/repositories/team.repo";
import { EditAppForm } from "@/components/apps/EditAppForm";

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

  // Verify user has access to this app's team
  const membership = await getTeamMembership(user.userId, app.teamId);
  if (!membership) {
    notFound();
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Edit: {app.name}
      </h1>
      <EditAppForm app={app} />
    </div>
  );
}
