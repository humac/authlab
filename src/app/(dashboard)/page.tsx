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
    <div className="space-y-6 animate-enter">
      <div className="surface-panel rounded-2xl p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">Dashboard</h1>
            {team && (
              <p className="mt-1 text-sm text-[var(--muted)]">
                Active team: {team.isPersonal ? "Personal Workspace" : team.name}
              </p>
            )}
          </div>
          <Link href="/apps/new">
            <Button>Create New App</Button>
          </Link>
        </div>
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
