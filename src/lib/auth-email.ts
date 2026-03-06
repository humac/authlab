import { sendTransactionalEmail } from "@/lib/email-provider";

function getAppBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export async function sendEmailVerificationLink(data: {
  email: string;
  name: string;
  token: string;
}) {
  const verifyUrl = `${getAppBaseUrl()}/verify-email?token=${encodeURIComponent(data.token)}`;
  const subject = "Verify your AuthLab account";
  const text = [
    `Hi ${data.name},`,
    "",
    "Verify your account by opening the link below:",
    verifyUrl,
    "",
    "This link expires in 24 hours.",
  ].join("\n");

  const html = `
    <p>Hi ${data.name},</p>
    <p>Verify your account by clicking the link below:</p>
    <p><a href="${verifyUrl}">${verifyUrl}</a></p>
    <p>This link expires in 24 hours.</p>
  `;

  return sendTransactionalEmail({
    to: data.email,
    subject,
    text,
    html,
  });
}

export async function sendPasswordResetLink(data: {
  email: string;
  name: string;
  token: string;
}) {
  const resetUrl = `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(data.token)}`;
  const subject = "Reset your AuthLab password";
  const text = [
    `Hi ${data.name},`,
    "",
    "Reset your password by opening the link below:",
    resetUrl,
    "",
    "This link expires in 30 minutes.",
  ].join("\n");

  const html = `
    <p>Hi ${data.name},</p>
    <p>Reset your password by clicking the link below:</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>This link expires in 30 minutes.</p>
  `;

  return sendTransactionalEmail({
    to: data.email,
    subject,
    text,
    html,
  });
}
