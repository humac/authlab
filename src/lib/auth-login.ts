import { getTeamsByUserId } from "@/repositories/team.repo";
import { getUserById } from "@/repositories/user.repo";

export async function resolveUserActiveTeamId(userId: string): Promise<string | null> {
  const [teams, user] = await Promise.all([getTeamsByUserId(userId), getUserById(userId)]);
  if (user?.defaultTeamId && teams.some((team) => team.id === user.defaultTeamId)) {
    return user.defaultTeamId;
  }
  const personalTeam = teams.find((team) => team.isPersonal);
  return personalTeam?.id ?? teams[0]?.id ?? null;
}
