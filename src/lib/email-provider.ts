import nodemailer from "nodemailer";
import { decrypt, encrypt } from "@/lib/encryption";
import { getSetting, setSetting } from "@/repositories/system-setting.repo";

export type EmailProviderType = "SMTP" | "BREVO";

export interface SmtpConfigInput {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password?: string;
  fromName: string;
  fromEmail: string;
}

export interface BrevoConfigInput {
  apiKey?: string;
  fromName: string;
  fromEmail: string;
}

export interface EmailProviderConfigInput {
  activeProvider: EmailProviderType;
  smtp?: SmtpConfigInput;
  brevo?: BrevoConfigInput;
}

export interface MaskedEmailProviderConfig {
  activeProvider: EmailProviderType | null;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    fromName: string;
    fromEmail: string;
    hasPassword: boolean;
  };
  brevo: {
    fromName: string;
    fromEmail: string;
    hasApiKey: boolean;
  };
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const KEYS = {
  activeProvider: "email.activeProvider",
  smtpHost: "email.smtp.host",
  smtpPort: "email.smtp.port",
  smtpSecure: "email.smtp.secure",
  smtpUsername: "email.smtp.username",
  smtpPasswordEnc: "email.smtp.passwordEnc",
  smtpFromName: "email.smtp.fromName",
  smtpFromEmail: "email.smtp.fromEmail",
  brevoApiKeyEnc: "email.brevo.apiKeyEnc",
  brevoFromName: "email.brevo.fromName",
  brevoFromEmail: "email.brevo.fromEmail",
} as const;

async function getRequiredSetting(key: string): Promise<string | null> {
  const value = await getSetting(key);
  return value?.trim() ? value.trim() : null;
}

function parseBool(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return value === "true";
}

function parseIntSafe(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const num = parseInt(value, 10);
  return Number.isFinite(num) ? num : fallback;
}

export async function getMaskedEmailProviderConfig(): Promise<MaskedEmailProviderConfig> {
  const [
    activeProvider,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUsername,
    smtpFromName,
    smtpFromEmail,
    smtpPasswordEnc,
    brevoFromName,
    brevoFromEmail,
    brevoApiKeyEnc,
  ] = await Promise.all([
    getRequiredSetting(KEYS.activeProvider),
    getRequiredSetting(KEYS.smtpHost),
    getRequiredSetting(KEYS.smtpPort),
    getRequiredSetting(KEYS.smtpSecure),
    getRequiredSetting(KEYS.smtpUsername),
    getRequiredSetting(KEYS.smtpFromName),
    getRequiredSetting(KEYS.smtpFromEmail),
    getRequiredSetting(KEYS.smtpPasswordEnc),
    getRequiredSetting(KEYS.brevoFromName),
    getRequiredSetting(KEYS.brevoFromEmail),
    getRequiredSetting(KEYS.brevoApiKeyEnc),
  ]);

  return {
    activeProvider:
      activeProvider === "SMTP" || activeProvider === "BREVO"
        ? activeProvider
        : null,
    smtp: {
      host: smtpHost ?? "",
      port: parseIntSafe(smtpPort, 587),
      secure: parseBool(smtpSecure, false),
      username: smtpUsername ?? "",
      fromName: smtpFromName ?? "",
      fromEmail: smtpFromEmail ?? "",
      hasPassword: Boolean(smtpPasswordEnc),
    },
    brevo: {
      fromName: brevoFromName ?? "",
      fromEmail: brevoFromEmail ?? "",
      hasApiKey: Boolean(brevoApiKeyEnc),
    },
  };
}

export async function saveEmailProviderConfig(input: EmailProviderConfigInput) {
  if (input.activeProvider === "SMTP" && !input.smtp) {
    throw new Error("SMTP config is required when SMTP is active");
  }
  if (input.activeProvider === "BREVO" && !input.brevo) {
    throw new Error("Brevo config is required when Brevo is active");
  }

  await setSetting(KEYS.activeProvider, input.activeProvider);

  if (input.smtp) {
    await Promise.all([
      setSetting(KEYS.smtpHost, input.smtp.host),
      setSetting(KEYS.smtpPort, String(input.smtp.port)),
      setSetting(KEYS.smtpSecure, String(input.smtp.secure)),
      setSetting(KEYS.smtpUsername, input.smtp.username),
      setSetting(KEYS.smtpFromName, input.smtp.fromName),
      setSetting(KEYS.smtpFromEmail, input.smtp.fromEmail),
    ]);

    if (input.smtp.password) {
      await setSetting(KEYS.smtpPasswordEnc, encrypt(input.smtp.password));
    }
  }

  if (input.brevo) {
    await Promise.all([
      setSetting(KEYS.brevoFromName, input.brevo.fromName),
      setSetting(KEYS.brevoFromEmail, input.brevo.fromEmail),
    ]);

    if (input.brevo.apiKey) {
      await setSetting(KEYS.brevoApiKeyEnc, encrypt(input.brevo.apiKey));
    }
  }
}

async function sendWithSmtp(config: Required<SmtpConfigInput>, email: SendEmailInput) {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: config.password,
    },
  });

  await transporter.sendMail({
    from: `${config.fromName} <${config.fromEmail}>`,
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

async function sendWithBrevo(config: Required<BrevoConfigInput>, email: SendEmailInput) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": config.apiKey,
    },
    body: JSON.stringify({
      sender: {
        name: config.fromName,
        email: config.fromEmail,
      },
      to: [{ email: email.to }],
      subject: email.subject,
      textContent: email.text,
      htmlContent: email.html,
    }),
  });

  if (!res.ok) {
    throw new Error("Brevo API send failed");
  }
}

export async function sendEmailWithUnsavedProviderConfig(data: {
  provider: EmailProviderType;
  smtp?: Required<SmtpConfigInput>;
  brevo?: Required<BrevoConfigInput>;
  email: SendEmailInput;
}) {
  if (data.provider === "SMTP") {
    if (!data.smtp) throw new Error("SMTP config is required");
    await sendWithSmtp(data.smtp, data.email);
    return;
  }

  if (!data.brevo) throw new Error("Brevo config is required");
  await sendWithBrevo(data.brevo, data.email);
}

async function loadActiveProviderConfig(): Promise<
  | { provider: "SMTP"; config: Required<SmtpConfigInput> }
  | { provider: "BREVO"; config: Required<BrevoConfigInput> }
  | null
> {
  const activeProvider = await getRequiredSetting(KEYS.activeProvider);

  if (activeProvider === "SMTP") {
    const [
      host,
      port,
      secure,
      username,
      passwordEnc,
      fromName,
      fromEmail,
    ] = await Promise.all([
      getRequiredSetting(KEYS.smtpHost),
      getRequiredSetting(KEYS.smtpPort),
      getRequiredSetting(KEYS.smtpSecure),
      getRequiredSetting(KEYS.smtpUsername),
      getRequiredSetting(KEYS.smtpPasswordEnc),
      getRequiredSetting(KEYS.smtpFromName),
      getRequiredSetting(KEYS.smtpFromEmail),
    ]);

    if (!host || !username || !passwordEnc || !fromName || !fromEmail) {
      return null;
    }

    return {
      provider: "SMTP",
      config: {
        host,
        port: parseIntSafe(port, 587),
        secure: parseBool(secure, false),
        username,
        password: decrypt(passwordEnc),
        fromName,
        fromEmail,
      },
    };
  }

  if (activeProvider === "BREVO") {
    const [apiKeyEnc, fromName, fromEmail] = await Promise.all([
      getRequiredSetting(KEYS.brevoApiKeyEnc),
      getRequiredSetting(KEYS.brevoFromName),
      getRequiredSetting(KEYS.brevoFromEmail),
    ]);

    if (!apiKeyEnc || !fromName || !fromEmail) {
      return null;
    }

    return {
      provider: "BREVO",
      config: {
        apiKey: decrypt(apiKeyEnc),
        fromName,
        fromEmail,
      },
    };
  }

  return null;
}

export async function sendTransactionalEmail(email: SendEmailInput): Promise<boolean> {
  const active = await loadActiveProviderConfig();
  if (!active) {
    return false;
  }

  if (active.provider === "SMTP") {
    await sendWithSmtp(active.config, email);
  } else {
    await sendWithBrevo(active.config, email);
  }

  return true;
}
