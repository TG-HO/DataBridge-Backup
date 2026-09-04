import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";

/**
 * Retrieves and validates the 32-byte encryption key from environment.
 * If the key in .env is 64 hex characters, parses it to 32 bytes.
 * Otherwise hashes it with SHA-256 to ensure exactly 32 bytes for AES-256.
 */
function getKeyBuffer(): Buffer {
  const rawKey = process.env.ENCRYPTION_KEY || "default-databridge-ai-secure-encryption-key-32b";

  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, "hex");
  }

  // Fallback: derive 32-byte key via SHA-256
  return crypto.createHash("sha256").update(rawKey).digest();
}

/**
 * Encrypts a plaintext password using AES-256-CBC with a random 16-byte IV.
 * @param plainText The plaintext database password.
 * @returns Serialized format "ivHex:cipherHex" safe for database storage.
 */
export function encryptPassword(plainText: string): string {
  if (!plainText) {
    throw new Error("Cannot encrypt empty password");
  }

  const key = getKeyBuffer();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");

  return `${iv.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts an AES-256-CBC encrypted password string in memory only.
 * Call this function strictly in backend execution contexts when connecting to databases.
 * @param encryptedPayload String formatted as "ivHex:cipherHex".
 * @returns Plaintext password.
 */
export function decryptPassword(encryptedPayload: string): string {
  if (!encryptedPayload) {
    throw new Error("Cannot decrypt empty payload");
  }

  const parts = encryptedPayload.split(":");
  if (parts.length !== 2) {
    throw new Error("Invalid encrypted payload format; expected ivHex:cipherHex");
  }

  const [ivHex, cipherHex] = parts;
  const key = getKeyBuffer();
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  let decrypted = decipher.update(cipherHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
