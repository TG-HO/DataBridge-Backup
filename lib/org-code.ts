import crypto from "crypto";

/**
 * Generates a clean, human-readable organization invite code.
 * Format: 8-character uppercase alphanumeric (e.g. TG-7K92M4 or ORG-849201)
 */
export function generateOrgCode(prefix = "ORG"): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 3) || "ORG";
  const randomChars = crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
  return `${cleanPrefix}-${randomChars}`;
}
