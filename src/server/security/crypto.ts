import crypto from "node:crypto";

function keyFromEnv(name: string, bytes: number): Buffer {
  const raw = process.env[name];
  if (!raw) {
    if (process.env.NODE_ENV === "production") throw new Error(`${name} must be set in production`);
    // Development fallback so the app boots before `pnpm bootstrap`; never used in production.
    return crypto.createHash("sha256").update(`workbench-dev-${name}`).digest().subarray(0, bytes);
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length < bytes) throw new Error(`${name} must be at least ${bytes} bytes (base64)`);
  return buf.subarray(0, bytes);
}

/** AES-256-GCM. Output layout: [12-byte IV][16-byte tag][ciphertext]. */
export function encrypt(plain: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFromEnv("DATA_ENCRYPTION_KEY", 32), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decrypt(blob: Buffer): Buffer {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyFromEnv("DATA_ENCRYPTION_KEY", 32), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]);
}

export function hmac(value: string): string {
  return crypto.createHmac("sha256", keyFromEnv("SIGNING_SECRET", 32)).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Signed, expiring URL for a private object. The route still re-checks tenancy. */
export function signPath(pathname: string, ttlSeconds = 300): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = hmac(`${pathname}:${exp}`);
  return `${pathname}?exp=${exp}&sig=${sig}`;
}

export function verifySignedPath(pathname: string, exp: string | null, sig: string | null): boolean {
  if (!exp || !sig) return false;
  const expN = Number(exp);
  if (!Number.isFinite(expN) || expN < Date.now() / 1000) return false;
  return safeEqual(hmac(`${pathname}:${expN}`), sig);
}
