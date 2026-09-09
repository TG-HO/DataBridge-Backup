import { Client as PgClient } from "pg";

export interface PgConnectionParams {
  host: string;
  port: number | string;
  database: string;
  user: string;
  password?: string;
  timeoutMillis?: number;
}

/**
 * Connects to PostgreSQL with smart, adaptive SSL negotiation.
 * - For Supabase/Neon/Render/AWS cloud hosts, tries SSL first with self-signed fallback.
 * - For direct IP / on-premise hosts (e.g. 103.79.17.77), connects non-SSL first without triggering SSL errors,
 *   retrying with SSL only if the server explicitly requires encryption.
 */
export async function createConnectedPgClient(params: PgConnectionParams): Promise<PgClient> {
  const host = params.host.trim();
  const port = Number(params.port) || 5432;
  const timeout = params.timeoutMillis || 7000;

  const isCloudHost =
    host.includes("supabase.co") ||
    host.includes("pooler.supabase.com") ||
    host.includes("neon.tech") ||
    host.includes("render.com") ||
    host.includes("amazonaws.com") ||
    port === 6543;

  if (isCloudHost) {
    try {
      const client = new PgClient({
        host,
        port,
        database: params.database,
        user: params.user,
        password: params.password,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: timeout,
      });
      await client.connect();
      return client;
    } catch (sslErr: unknown) {
      const msg = sslErr instanceof Error ? sslErr.message : String(sslErr);
      if (msg.includes("does not support SSL") || (sslErr as { code?: string })?.code === "ECONNRESET") {
        const fallbackClient = new PgClient({
          host,
          port,
          database: params.database,
          user: params.user,
          password: params.password,
          ssl: false,
          connectionTimeoutMillis: timeout,
        });
        await fallbackClient.connect();
        return fallbackClient;
      }
      throw sslErr;
    }
  } else {
    // Direct or on-premise IP address: connect without SSL first
    try {
      const client = new PgClient({
        host,
        port,
        database: params.database,
        user: params.user,
        password: params.password,
        ssl: false,
        connectionTimeoutMillis: timeout,
      });
      await client.connect();
      return client;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // If server specifically demands SSL
      if (msg.includes("SSL") || msg.includes("encryption")) {
        try {
          const sslClient = new PgClient({
            host,
            port,
            database: params.database,
            user: params.user,
            password: params.password,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: timeout,
          });
          await sslClient.connect();
          return sslClient;
        } catch {
          throw err;
        }
      }
      throw err;
    }
  }
}
