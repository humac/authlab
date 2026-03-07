import { createPrivateKey, createPublicKey } from "crypto";

function normalizePem(value: string): string {
  return value.replace(/\\n/g, "\n").trim();
}

export function validatePemCertificate(value: string): string {
  const normalized = normalizePem(value);
  createPublicKey(normalized);
  return normalized;
}

export function validatePemPrivateKey(value: string): string {
  const normalized = normalizePem(value);
  createPrivateKey(normalized);
  return normalized;
}
