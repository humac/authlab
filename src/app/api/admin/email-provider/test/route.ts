import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-session";
import { TestEmailProviderSchema } from "@/lib/validators";
import { sendEmailWithUnsavedProviderConfig } from "@/lib/email-provider";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isSystemAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = TestEmailProviderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.provider === "SMTP") {
      if (!parsed.data.smtp || !parsed.data.smtp.password) {
        return NextResponse.json(
          { error: "SMTP password is required for test" },
          { status: 400 },
        );
      }

      await sendEmailWithUnsavedProviderConfig({
        provider: "SMTP",
        smtp: {
          host: parsed.data.smtp.host,
          port: parsed.data.smtp.port,
          secure: parsed.data.smtp.secure,
          username: parsed.data.smtp.username,
          password: parsed.data.smtp.password,
          fromName: parsed.data.smtp.fromName,
          fromEmail: parsed.data.smtp.fromEmail,
        },
        email: {
          to: parsed.data.recipientEmail,
          subject: "AuthLab Email Provider Test",
          text: "This is a test email from AuthLab.",
          html: "<p>This is a test email from <strong>AuthLab</strong>.</p>",
        },
      });
    } else {
      if (!parsed.data.brevo || !parsed.data.brevo.apiKey) {
        return NextResponse.json(
          { error: "Brevo API key is required for test" },
          { status: 400 },
        );
      }

      await sendEmailWithUnsavedProviderConfig({
        provider: "BREVO",
        brevo: {
          apiKey: parsed.data.brevo.apiKey,
          fromName: parsed.data.brevo.fromName,
          fromEmail: parsed.data.brevo.fromEmail,
        },
        email: {
          to: parsed.data.recipientEmail,
          subject: "AuthLab Email Provider Test",
          text: "This is a test email from AuthLab.",
          html: "<p>This is a test email from <strong>AuthLab</strong>.</p>",
        },
      });
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to send test email" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
