import { authenticator } from "otplib";
import QRCode from "qrcode";

authenticator.options = {
  digits: 6,
  step: 30,
  window: 1,
};

export async function createTotpSetup(data: {
  accountName: string;
  issuer: string;
}) {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(data.accountName, data.issuer, secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  return {
    secret,
    otpauthUrl,
    qrCodeDataUrl,
  };
}

export function verifyTotpToken(secret: string, token: string): boolean {
  const normalized = token.replace(/\s+/g, "");
  return authenticator.verify({ token: normalized, secret });
}
