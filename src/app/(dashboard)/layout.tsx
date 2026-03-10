import { AppShell } from "@/components/layout/AppShell";
import { UserProvider, type UserContextType } from "@/components/providers/UserProvider";
import { requireUser } from "@/lib/user-session";
import { hasProfileImageByUserId } from "@/repositories/profile-image.repo";
import { getTeamsByUserId } from "@/repositories/team.repo";
import { getUserById } from "@/repositories/user.repo";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionUser = await requireUser();
  const [teams, hasProfileImage, dbUser] = await Promise.all([
    getTeamsByUserId(sessionUser.userId),
    hasProfileImageByUserId(sessionUser.userId),
    getUserById(sessionUser.userId),
  ]);

  const userData: UserContextType = {
    userId: sessionUser.userId,
    name: sessionUser.name,
    email: sessionUser.email,
    hasProfileImage,
    isSystemAdmin: sessionUser.isSystemAdmin,
    mustChangePassword: sessionUser.mustChangePassword,
    isVerified: sessionUser.isVerified,
    mfaEnabled: sessionUser.mfaEnabled,
    activeTeamId: sessionUser.activeTeamId,
    defaultTeamId: dbUser?.defaultTeamId ?? null,
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
