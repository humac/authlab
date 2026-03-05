import { getCurrentUser } from "./user-session";
import { getTeamMembership } from "@/repositories/team.repo";
import type { TeamRole } from "@/generated/prisma/client/enums";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function requireTeamAccess(
  teamId: string,
  requiredRoles?: TeamRole[],
) {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Unauthorized", 401);

  const membership = await getTeamMembership(user.userId, teamId);
  if (!membership) throw new AuthError("Forbidden", 403);

  if (requiredRoles && !requiredRoles.includes(membership.role)) {
    throw new AuthError("Insufficient permissions", 403);
  }

  return { user, membership };
}
