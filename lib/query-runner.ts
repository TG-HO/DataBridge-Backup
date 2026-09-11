import sql from "mssql";
import mysql, { RowDataPacket } from "mysql2/promise";
import { createConnectedPgClient } from "@/lib/pg-client";
import { MongoClient } from "mongodb";
import { getOrCreateFirebaseFirestore } from "@/lib/firebase-server";
import { decryptPassword } from "@/lib/crypto";

export interface DbConnectionRecord {
  id: string;
  name: string;
  dbType: string;
  host: string;
  port: number;
  dbName: string;
  username: string;
  encryptedPassword: string;
  schemaContext?: string | null;
}

/**
 * Safely executes a read-only query against any supported database engine
 * and returns normalized array of JSON records.
 */
export async function executeRawQueryOnConnection(
  conn: DbConnectionRecord,
  query: string
): Promise<Record<string, unknown>[]> {
  const plainPassword = decryptPassword(conn.encryptedPassword);
  const dbType = conn.dbType.toLowerCase();

  // 1. MySQL Execution
  if (dbType === "mysql") {
    let mysqlConn = null;
    try {
      mysqlConn = await mysql.createConnection({
        host: conn.host,
        port: Number(conn.port) || 3306,
        database: conn.dbName,
        user: conn.username,
        password: plainPassword,
        connectTimeout: 8000,
      });

      const cleanQuery = query.replace(/;\s*$/, "");
      const [rows] = await mysqlConn.query<RowDataPacket[]>(cleanQuery);
      return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
    } finally {
      if (mysqlConn) {
        try {
          await mysqlConn.end();
        } catch {}
      }
    }
  }

  // 2. PostgreSQL & Supabase Execution
  if (dbType === "postgres" || dbType === "postgresql" || dbType === "supabase") {
    let pgClient = null;
    try {
      pgClient = await createConnectedPgClient({
        host: conn.host,
        port: conn.port || 5432,
        database: conn.dbName,
        user: conn.username,
        password: plainPassword,
        timeoutMillis: 8000,
      });

      const cleanQuery = query.replace(/;\s*$/, "");
      const queryRes = await pgClient.query(cleanQuery);
      return Array.isArray(queryRes.rows) ? queryRes.rows : [];
    } finally {
      if (pgClient) {
        try {
          await pgClient.end();
        } catch {}
      }
    }
  }

  // 3. MongoDB Execution
  if (dbType === "mongodb") {
    let mongoClient: MongoClient | null = null;
    try {
      let uri = conn.host.trim();
      if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
        const authPart = conn.username ? `${encodeURIComponent(conn.username)}:${encodeURIComponent(plainPassword)}@` : "";
        const portPart = conn.port ? `:${conn.port}` : ":27017";
        uri = `mongodb://${authPart}${conn.host}${portPart}/${conn.dbName}`;
      }

      mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 6000 });
      await mongoClient.connect();
      const db = mongoClient.db(conn.dbName);

      // Attempt to parse JSON query
      let collName = "data";
      let filter = {};
      let limit = 50;

      try {
        const jsonMatch = query.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.collection) collName = parsed.collection;
          if (parsed.filter) filter = parsed.filter;
          if (parsed.limit) limit = parsed.limit;
        }
      } catch {}

      const docs = await db.collection(collName).find(filter).limit(limit).toArray();
      return docs.map((d) => ({
        ...d,
        _id: String(d._id),
      }));
    } finally {
      if (mongoClient) {
        try {
          await mongoClient.close();
        } catch {}
      }
    }
  }

  // 4. Firebase Firestore Execution
  if (dbType === "firebase" || dbType === "firestore") {
    const firestore = await getOrCreateFirebaseFirestore(
      {
        id: conn.id,
        host: conn.host,
        dbName: conn.dbName,
        username: conn.username,
        plainPassword,
      },
      "runner-fb"
    );

    let collName = "users";
    try {
      const jsonMatch = query.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.collection) collName = parsed.collection;
      }
    } catch {}

    const snapshot = await firestore.collection(collName).limit(50).get();
    const docs: Record<string, unknown>[] = [];
    snapshot.forEach((doc) => {
      docs.push({ id: doc.id, ...doc.data() });
    });
    return docs;
  }

  // 5. Microsoft SQL Server Execution (Default)
  let pool: sql.ConnectionPool | null = null;
  try {
    const mssqlConfig: sql.config = {
      server: conn.host,
      port: conn.port || 1433,
      database: conn.dbName,
      user: conn.username,
      password: plainPassword,
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
      connectionTimeout: 8000,
      requestTimeout: 15000,
    };

    pool = await new sql.ConnectionPool(mssqlConfig).connect();
    const cleanQuery = query.replace(/;\s*$/, "");
    const res = await pool.request().query(cleanQuery);
    return Array.isArray(res.recordset) ? res.recordset : [];
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch {}
    }
  }
}
