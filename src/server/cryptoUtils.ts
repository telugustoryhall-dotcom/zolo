import crypto from 'node:crypto';

const getSecretPepper = (): string => {
  return process.env.AUTH_SECRET || 'zolo-chat-hmac-pepper-configure-auth-secret-in-prod';
};

export function generateNumericOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export function generateSalt(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function generateOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hashOtp(otp: string, salt: string): string {
  return crypto
    .createHmac('sha256', getSecretPepper())
    .update(`${salt}:${otp}`)
    .digest('hex');
}

export function verifyOtpConstantTime(
  candidateOtp: string,
  salt: string,
  expectedHashHex: string
): boolean {
  const actualHashHex = hashOtp(candidateOtp, salt);
  const a = Buffer.from(actualHashHex, 'hex');
  const b = Buffer.from(expectedHashHex, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function hashOpaqueToken(rawToken: string): string {
  return crypto
    .createHmac('sha256', getSecretPepper())
    .update(rawToken)
    .digest('hex');
}

export function verifyOpaqueTokenConstantTime(
  rawToken: string,
  expectedHashHex: string
): boolean {
  const actualHashHex = hashOpaqueToken(rawToken);
  const a = Buffer.from(actualHashHex, 'hex');
  const b = Buffer.from(expectedHashHex, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Hashes an account password using Node's native scrypt KDF with a random 16-byte salt
 * and server-side pepper. Stored format: `scrypt:<saltHex>:<derivedKeyHex>`.
 */
export function hashPassword(password: string): string {
  const saltHex = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(`${password}:${getSecretPepper()}`, saltHex, 64);
  return `scrypt:${saltHex}:${derivedKey.toString('hex')}`;
}

export function verifyPassword(candidatePassword: string, storedHash: string | null): boolean {
  if (!storedHash || !storedHash.startsWith('scrypt:')) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const [, saltHex, expectedKeyHex] = parts;
  if (!saltHex || !expectedKeyHex) return false;

  const actualKey = crypto.scryptSync(`${candidatePassword}:${getSecretPepper()}`, saltHex, 64);
  const expectedKey = Buffer.from(expectedKeyHex, 'hex');
  if (actualKey.length !== expectedKey.length) return false;
  return crypto.timingSafeEqual(actualKey, expectedKey);
}

export function generateRecoveryKey(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const group = () => {
    let out = '';
    for (let i = 0; i < 4; i++) {
      out += alphabet[crypto.randomInt(0, alphabet.length)];
    }
    return out;
  };
  return `ZOLO-${group()}-${group()}-${group()}`;
}

export function normalizeRecoveryKey(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}
