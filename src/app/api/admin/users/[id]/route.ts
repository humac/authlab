import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-session";
import { getUserById, updateUser } from "@/repositories/user.repo";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.isSystemAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Prevent admins from de-admining themselves
  if (id === currentUser.userId) {
    return NextResponse.json(
      { error: "Cannot modify your own admin status" },
      { status: 400 },
    );
  }

  const body = await request.json();
  const updates: Partial<{ isSystemAdmin: boolean }> = {};

  if (typeof body.isSystemAdmin === "boolean") {
    updates.isSystemAdmin = body.isSystemAdmin;
  }

  const updated = await updateUser(id, updates);
  return NextResponse.json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    isSystemAdmin: updated.isSystemAdmin,
  });
}
