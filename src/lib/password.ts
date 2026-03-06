import argon2 from "argon2";
import bcrypt from "bcryptjs";

const BCRYPT_PREFIXES = ["$2a$", "$2b$", "$2y$"];

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  timeCost: 3,
  memoryCost: 19456,
  parallelism: 1,
};

function isBcryptHash(hash: string): boolean {
  return BCRYPT_PREFIXES.some((prefix) => hash.startsWith(prefix));
}

function isArgon2Hash(hash: string): boolean {
  return hash.startsWith("$argon2id$");
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  if (isArgon2Hash(hash)) {
    return argon2.verify(hash, password);
  }

  if (isBcryptHash(hash)) {
    return bcrypt.compare(password, hash);
  }

  return false;
}

export async function verifyPasswordAndMaybeUpgrade(
  password: string,
  hash: string,
): Promise<{ valid: boolean; upgradedHash?: string }> {
  const valid = await verifyPassword(password, hash);
  if (!valid) {
    return { valid: false };
  }

  if (isBcryptHash(hash)) {
    return {
      valid: true,
      upgradedHash: await hashPassword(password),
    };
  }

  return { valid: true };
}
