import { initializeApp, cert, getApps, deleteApp, App as FirebaseApp } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

export interface FirebaseConnectionConfig {
  id: string;
  host: string;
  dbName: string;
  username: string;
  plainPassword: string;
  forceRefresh?: boolean;
}

/**
 * Robustly constructs a Firebase Credential from either:
 * 1. Full Service Account JSON ({ "type": "service_account", ... })
 * 2. Raw PEM private key (-----BEGIN PRIVATE KEY-----)
 * 3. Raw Base64 private key without header/footer markers
 * 4. Key with escaped newlines (\n)
 */
export function createFirebaseCredential(
  projectId: string,
  clientEmail: string,
  secretPayload: string
) {
  const trimmed = (secretPayload || "").trim();
  if (!trimmed || trimmed === "none") {
    throw new Error(
      "Firebase private key or service account JSON is missing. Please provide your Service Account JSON or Private Key."
    );
  }

  // 1. Full JSON Service Account
  if (trimmed.startsWith("{")) {
    try {
      const sa = JSON.parse(trimmed);
      if (sa.private_key) {
        sa.private_key = sa.private_key.replace(/\\n/g, "\n");
      }
      return cert(sa);
    } catch (parseErr) {
      throw new Error(
        `Invalid Firebase Service Account JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
      );
    }
  }

  // 2. Direct Private Key (PEM or raw base64)
  let normalizedKey = trimmed.replace(/\\n/g, "\n").trim();
  if (
    (normalizedKey.startsWith('"') && normalizedKey.endsWith('"')) ||
    (normalizedKey.startsWith("'") && normalizedKey.endsWith("'"))
  ) {
    normalizedKey = normalizedKey.slice(1, -1).trim();
  }

  // If user pasted only the base64 body without PEM headers
  if (!normalizedKey.includes("-----BEGIN PRIVATE KEY-----")) {
    if (!normalizedKey.includes("BEGIN RSA PRIVATE KEY")) {
      normalizedKey = `-----BEGIN PRIVATE KEY-----\n${normalizedKey}\n-----END PRIVATE KEY-----`;
    }
  }

  const effectiveEmail = (clientEmail || "").trim();
  if (!effectiveEmail) {
    throw new Error(
      "Firebase Client Email is required when using a private key directly (e.g. firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com)."
    );
  }

  try {
    return cert({
      projectId: projectId || undefined,
      clientEmail: effectiveEmail,
      privateKey: normalizedKey,
    });
  } catch (certErr) {
    throw new Error(
      `Failed to parse Firebase Private Key: ${certErr instanceof Error ? certErr.message : String(certErr)}. Please verify you pasted the valid private key from your Firebase service account.`
    );
  }
}

/**
 * Initializes or retrieves a singleton Firebase App instance and returns Firestore client.
 */
export async function getOrCreateFirebaseFirestore(
  config: FirebaseConnectionConfig,
  appNamePrefix: string = "databridge-fb"
): Promise<Firestore> {
  const appName = `${appNamePrefix}-${config.id}`;
  const existingApps = getApps();
  const existing = existingApps.find((a) => a.name === appName);

  if (existing) {
    if (config.forceRefresh) {
      try {
        await deleteApp(existing);
      } catch {}
    } else {
      return getFirestore(existing);
    }
  }

  const projectId = config.host.trim() || config.dbName.trim();
  const credential = createFirebaseCredential(projectId, config.username, config.plainPassword);

  const fbApp = initializeApp(
    {
      credential,
      projectId,
    },
    appName
  );

  return getFirestore(fbApp);
}
