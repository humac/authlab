import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-session";
import { generateSelfSignedSamlSigningMaterial } from "@/lib/saml-signing-material";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name : undefined;
    const slug = typeof body?.slug === "string" ? body.slug : undefined;

    const signingMaterial = await generateSelfSignedSamlSigningMaterial({
      name,
      slug,
    });

    return NextResponse.json(signingMaterial, { status: 201 });
  } catch (error) {
    console.error("POST /api/saml/signing-material failed:", error);
    return NextResponse.json(
      { error: "Failed to generate test signing material" },
      { status: 500 },
    );
  }
}
