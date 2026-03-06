import { getTeamsByUserId } from "@/repositories/team.repo";

export async function resolveUserActiveTeamId(userId: string): Promise<string | null> {
  const teams = await getTeamsByUserId(userId);
  const personalTeam = teams.find((team) => team.isPersonal);
  return personalTeam?.id ?? teams[0]?.id ?? null;
}
