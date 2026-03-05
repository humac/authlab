import Link from "next/link";
import { requireUser } from "@/lib/user-session";
import { listAppInstancesByTeam } from "@/repositories/app-instance.repo";
import {
  getTeamById,
  getTeamMembership,
  listTeamMembers,
} from "@/repositories/team.repo";
import { Button } from "@/components/ui/Button";
import { Dashboard } from "@/components/apps/Dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const [apps, team, membership] = await Promise.all([
    listAppInstancesByTeam(user.activeTeamId),
    getTeamById(user.activeTeamId),
    getTeamMembership(user.userId, user.activeTeamId),
  ]);
  const members = team ? await listTeamMembers(team.id) : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          {team && (
            <p className="text-sm text-gray-500 mt-1">
              Active team: {team.isPersonal ? "Personal Workspace" : team.name}
            </p>
          )}
        </div>
        <Link href="/apps/new">
          <Button>Create New App</Button>
        </Link>
      </div>
      <Dashboard
        key={user.activeTeamId}
        initialApps={apps}
        team={{
          id: user.activeTeamId,
          name: team?.name || "Unknown Team",
          isPersonal: team?.isPersonal ?? false,
          currentRole: membership?.role || "MEMBER",
          members,
        }}
        currentUserId={user.userId}
      />
    </div>
  );
}
