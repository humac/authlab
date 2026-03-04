import { NextResponse } from "next/server";
import { CreateAppInstanceSchema } from "@/lib/validators";
import {
  createAppInstance,
  listAppInstances,
} from "@/repositories/app-instance.repo";

export async function GET() {
  const apps = await listAppInstances();
  return NextResponse.json(apps);
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = CreateAppInstanceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const app = await createAppInstance(parsed.data);
    return NextResponse.json(app, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return NextResponse.json(
        { error: "An app with this slug already exists" },
        { status: 409 },
      );
    }
    throw error;
  }
}
