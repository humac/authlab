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
import { PageHeader } from "@/components/layout/PageHeader";

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
    <div className="space-y-4 animate-enter">
      <PageHeader
        title="Dashboard"
        actions={
          <Link href="/apps/new">
            <Button size="sm">Create New App</Button>
          </Link>
        }
      >
        {team ? (
          <p className="text-sm text-[var(--muted)]">
            Active team{" "}
            <span className="font-medium text-[var(--text)]">
              {team.isPersonal ? "Personal Workspace" : team.name}
            </span>
          </p>
        ) : null}
      </PageHeader>

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
