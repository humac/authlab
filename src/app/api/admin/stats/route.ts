import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-session";
import { countUsers } from "@/repositories/user.repo";
import { countTeams } from "@/repositories/team.repo";
import { countAppInstances } from "@/repositories/app-instance.repo";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isSystemAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [totalUsers, totalTeams, totalApps] = await Promise.all([
    countUsers(),
    countTeams(),
    countAppInstances(),
  ]);

  return NextResponse.json({ totalUsers, totalTeams, totalApps });
}
