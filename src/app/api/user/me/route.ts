import { NextResponse } from "next/server";
import { getCurrentUser, getUserSession } from "@/lib/user-session";
import { getUserById, updateUser } from "@/repositories/user.repo";
import { getTeamsByUserId } from "@/repositories/team.repo";
import { UpdateUserSchema } from "@/lib/validators";
import { verifyPasswordAndMaybeUpgrade, hashPassword } from "@/lib/password";

export async function GET() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserById(sessionUser.userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const teams = await getTeamsByUserId(user.id);

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    isSystemAdmin: user.isSystemAdmin,
    mustChangePassword: user.mustChangePassword,
    isVerified: user.isVerified,
    mfaEnabled: user.mfaEnabled,
    activeTeamId: sessionUser.activeTeamId,
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      isPersonal: t.isPersonal,
      role: t.role,
      memberCount: t.memberCount,
      appCount: t.appCount,
    })),
  });
}

export async function PUT(request: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = UpdateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { name, email, currentPassword, newPassword } = parsed.data;
  const updateData: Partial<{
    name: string;
    email: string;
    passwordHash: string;
    mustChangePassword: boolean;
  }> = {};

  if (name) updateData.name = name;
  if (email) updateData.email = email.toLowerCase();

  if (newPassword && currentPassword) {
    const user = await getUserById(sessionUser.userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const verified = await verifyPasswordAndMaybeUpgrade(
      currentPassword,
      user.passwordHash,
    );

    if (!verified.valid) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 },
      );
    }

    updateData.passwordHash = await hashPassword(newPassword);
    updateData.mustChangePassword = false;
  }

  const updated = await updateUser(sessionUser.userId, updateData);

  const session = await getUserSession();
  if (name) session.name = updated.name;
  if (email) session.email = updated.email;
  if (updateData.mustChangePassword !== undefined) {
    session.mustChangePassword = updateData.mustChangePassword;
  }
  await session.save();

  return NextResponse.json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    isSystemAdmin: updated.isSystemAdmin,
    mustChangePassword: updated.mustChangePassword,
    isVerified: updated.isVerified,
    mfaEnabled: updated.mfaEnabled,
  });
}
