import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-session";
import { hashPassword } from "@/lib/password";
import { AdminUpdateUserSchema } from "@/lib/validators";
import {
  countSystemAdmins,
  deleteUser,
  getUserById,
  updateUser,
} from "@/repositories/user.repo";

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

  const body = await request.json();
  const parsed = AdminUpdateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const updates: Partial<{
    email: string;
    name: string;
    isSystemAdmin: boolean;
    mustChangePassword: boolean;
    passwordHash: string;
    isVerified: boolean;
    mfaEnabled: boolean;
    totpSecretEnc: string | null;
    totpEnabledAt: Date | null;
  }> = {};

  if (parsed.data.name !== undefined) {
    updates.name = parsed.data.name;
  }
  if (parsed.data.email !== undefined) {
    updates.email = parsed.data.email.toLowerCase();
  }
  if (parsed.data.mustChangePassword !== undefined) {
    updates.mustChangePassword = parsed.data.mustChangePassword;
  }
  if (parsed.data.isVerified !== undefined) {
    updates.isVerified = parsed.data.isVerified;
  }
  if (parsed.data.mfaEnabled !== undefined) {
    updates.mfaEnabled = parsed.data.mfaEnabled;
    if (!parsed.data.mfaEnabled) {
      updates.totpSecretEnc = null;
      updates.totpEnabledAt = null;
    }
  }

  if (typeof parsed.data.isSystemAdmin === "boolean") {
    if (id === currentUser.userId && parsed.data.isSystemAdmin === false) {
      return NextResponse.json(
        { error: "Cannot remove your own system admin access" },
        { status: 400 },
      );
    }

    if (target.isSystemAdmin && parsed.data.isSystemAdmin === false) {
      const adminCount = await countSystemAdmins();
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "At least one system admin must remain" },
          { status: 400 },
        );
      }
    }

    updates.isSystemAdmin = parsed.data.isSystemAdmin;
  }

  if (parsed.data.tempPassword) {
    updates.passwordHash = await hashPassword(parsed.data.tempPassword);
    updates.mustChangePassword = true;
  }

  try {
    const updated = await updateUser(id, updates);
    return NextResponse.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      isSystemAdmin: updated.isSystemAdmin,
      mustChangePassword: updated.mustChangePassword,
      isVerified: updated.isVerified,
      mfaEnabled: updated.mfaEnabled,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 },
      );
    }
    throw error;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.isSystemAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (id === currentUser.userId) {
    return NextResponse.json(
      { error: "Cannot delete your own account from admin API" },
      { status: 400 },
    );
  }

  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.isSystemAdmin) {
    const adminCount = await countSystemAdmins();
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last system admin" },
        { status: 400 },
      );
    }
  }

  await deleteUser(id);
  return NextResponse.json({ ok: true });
}
