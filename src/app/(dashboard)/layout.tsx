import { AppShell } from "@/components/layout/AppShell";
import { UserProvider, type UserContextType } from "@/components/providers/UserProvider";
import { requireUser } from "@/lib/user-session";
import { getTeamsByUserId } from "@/repositories/team.repo";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionUser = await requireUser();
  const teams = await getTeamsByUserId(sessionUser.userId);

  const userData: UserContextType = {
    userId: sessionUser.userId,
    name: sessionUser.name,
    email: sessionUser.email,
    isSystemAdmin: sessionUser.isSystemAdmin,
    mustChangePassword: sessionUser.mustChangePassword,
    isVerified: sessionUser.isVerified,
    mfaEnabled: sessionUser.mfaEnabled,
    activeTeamId: sessionUser.activeTeamId,
    teams: teams.map((t: (typeof teams)[number]) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      isPersonal: t.isPersonal,
      role: t.role,
      memberCount: t.memberCount,
      appCount: t.appCount,
    })),
  };

  return (
    <UserProvider user={userData}>
      <AppShell>{children}</AppShell>
    </UserProvider>
  );
}
