import { NextResponse } from "next/server";
import { AuthError, requireTeamAccess } from "@/lib/authorize";
import { deleteInvite } from "@/repositories/invite.repo";
import { getPrisma } from "@/lib/db";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Look up the invite to find its team
  const prisma = await getPrisma();
  const invite = await prisma.inviteToken.findUnique({ where: { id } });
  if (!invite) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await requireTeamAccess(invite.teamId, ["OWNER", "ADMIN"]);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  await deleteInvite(id);
  return NextResponse.json({ ok: true });
}
