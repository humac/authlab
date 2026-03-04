import { NextResponse } from "next/server";
import { UpdateAppInstanceSchema } from "@/lib/validators";
import {
  getRedactedAppInstanceById,
  updateAppInstance,
  deleteAppInstance,
} from "@/repositories/app-instance.repo";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const app = await getRedactedAppInstanceById(id);
  if (!app) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(app);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = UpdateAppInstanceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const app = await updateAppInstance(id, parsed.data);
    return NextResponse.json(app);
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await deleteAppInstance(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}
