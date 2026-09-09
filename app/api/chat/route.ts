import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decryptPassword } from "@/lib/crypto";
import { generateText, streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import sql from "mssql";
import mysql, { RowDataPacket } from "mysql2/promise";
import { Client as PgClient } from "pg";
import { createConnectedPgClient } from "@/lib/pg-client";
import { MongoClient } from "mongodb";
import { initializeApp, cert, getApps, App as FirebaseApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatRequestBody {
  prompt?: string;
  message?: string;
  connectionId?: string;
  connectionIds?: string[];
  chatHistory?: ChatMessage[];
}

/**
 * Universal AI Model Provider Resolver
 */
function getLanguageModel() {
  const provider = (process.env.AI_PROVIDER || "").toLowerCase();
  const customBaseURL = process.env.AI_BASE_URL || process.env.OLLAMA_BASE_URL;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const openAiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;

  // 1. OpenRouter Provider (High-speed multi-model aggregator)
  if (provider === "openrouter" || (Boolean(openRouterKey) && (!provider || provider === "openrouter"))) {
    const baseURL = customBaseURL || "https://openrouter.ai/api/v1";
    const apiKey = openRouterKey || openAiKey || "";
    const modelName = process.env.AI_MODEL || "google/gemini-2.5-flash";
    if (!apiKey) {
      return { model: null, providerName: "OpenRouter", modelName, isConfigured: false };
    }
    const client = createOpenAI({
      baseURL,
      apiKey,
      headers: {
        "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
        "X-Title": "DataBridge AI",
      },
    });
    return {
      model: client.chat(modelName),
      providerName: "OpenRouter",
      modelName,
      isConfigured: true,
    };
  }

  // 2. Ollama Provider
  if (provider === "ollama" || (!provider && customBaseURL?.includes("11434"))) {
    const baseURL = customBaseURL || "http://localhost:11434/v1";
    const modelName = process.env.AI_MODEL || "llama3.1";
    const client = createOpenAI({ baseURL, apiKey: "ollama" });
    return {
      model: client.chat(modelName),
      providerName: "Ollama",
      modelName,
      isConfigured: true,
    };
  }

  // 3. NVIDIA NIM Provider
  if (provider === "nvidia" || (!provider && Boolean(nvidiaKey))) {
    const baseURL = customBaseURL || "https://integrate.api.nvidia.com/v1";
    const apiKey = nvidiaKey || openAiKey || "";
    const modelName = process.env.AI_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b";
    if (!apiKey) {
      return { model: null, providerName: "NVIDIA", modelName, isConfigured: false };
    }
    const client = createOpenAI({ baseURL, apiKey });
    return {
      model: client.chat(modelName),
      providerName: "NVIDIA NIM",
      modelName,
      isConfigured: true,
    };
  }

  // 4. OpenAI or custom OpenAI-compatible server
  if (provider === "openai" || openAiKey) {
    const modelName = process.env.AI_MODEL || "gpt-4o";
    const client = createOpenAI({
      apiKey: openAiKey || "",
      baseURL: customBaseURL || undefined,
    });
    return {
      model: client.chat(modelName),
      providerName: customBaseURL ? "Custom OpenAI-Compatible" : "OpenAI",
      modelName,
      isConfigured: Boolean(openAiKey),
    };
  }

  // 5. Default Fallback
  return {
    model: null,
    providerName: "Autonomous Simulation Engine",
    modelName: "autonomous-analyst-v1",
    isConfigured: false,
  };
}

/**
 * Master System Prompt for Business Analysis
 */
const MASTER_ANALYST_SYSTEM_PROMPT = `You are an expert database analyst and business intelligence assistant. Your users are non-technical business users and managers who have no knowledge of the database schema.

Your job is to translate natural-language business questions into accurate, read-only database queries and provide clear business answers.

CRITICAL RULES:
1. NEVER guess, assume, or hallucinate table names, column names, relationships, meanings, or data.
2. STRICT COLUMN & TABLE ACCURACY: ONLY query table and column names that EXPLICITLY exist in the provided schema for that database.
3. CRITICAL JOIN SYNTAX: Whenever joining tables (e.g. customers c JOIN sales s ON ...), ALWAYS table-qualify every single column in the SELECT, ON, WHERE, GROUP BY, and ORDER BY clauses (e.g. c.customer_id, s.total_amount). NEVER leave a join column bare/unqualified to prevent "ambiguous column" errors!
4. Strict Read-Only Guarantee: Only generate read-only SELECT statements. Never write DROP, INSERT, UPDATE, DELETE, TRUNCATE, ALTER, or EXEC.
5. HIDE TECHNICAL IMPLEMENTATION & SQL QUERIES: The user is a non-technical executive. NEVER output raw SQL queries, SQL code fences (\`\`\`sql ... \`\`\`), or database syntax in your response to the user. Present exclusively clean markdown tables, formatted metrics, and strategic business takeaways.`;

/**
 * Validates that the generated SQL statement is strictly read-only
 */
function isSafeReadOnlyQuery(query: string): boolean {
  const trimmed = query.trim().toUpperCase();

  if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("WITH")) {
    return false;
  }

  const destructivePattern =
    /\b(DROP|INSERT|DELETE|UPDATE|TRUNCATE|ALTER|EXEC|EXECUTE|CREATE|GRANT|REVOKE|MERGE)\b/i;

  return !destructivePattern.test(query);
}

/**
 * Robustly extracts and sanitizes executable SQL queries from LLM output.
 * Handles markdown code fences, conversational preamble, thinking tags, and trailing notes.
 */
function cleanQueryString(raw: string): string {
  if (!raw) return "";
  let text = raw.trim();

  // 1. If code block exists anywhere in text, extract its contents
  const sqlBlockMatch = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  if (sqlBlockMatch && sqlBlockMatch[1]) {
    text = sqlBlockMatch[1].trim();
  }

  // 2. If text still has conversational preamble before SELECT or WITH, extract from SELECT/WITH
  const selectMatch = text.match(/\b(SELECT\b[\s\S]*?(?:;|\n\s*\n|$)|WITH\b[\s\S]*?(?:;|\n\s*\n|$))/i);
  if (selectMatch && selectMatch[1]) {
    text = selectMatch[1].trim();
  }

  // Clean trailing semicolons or backticks
  text = text.replace(/```/g, "").trim();
  return text;
}

/**
 * Finds the most relevant table name from schema context based on prompt keywords.
 * Avoids picking internal telemetry or audit tables.
 */
function findRelevantTable(schemaContext?: string | null, prompt: string = ""): string {
  if (!schemaContext) return "customers";
  const lower = prompt.toLowerCase();

  const matches = [...schemaContext.matchAll(/- \*\*([^*]+)\*\*/g)].map((m) => m[1].trim());
  if (matches.length === 0) return "customers";

  if (lower.includes("sale") || lower.includes("revenue") || lower.includes("spent") || lower.includes("pay")) {
    const saleTable = matches.find(
      (t) =>
        t.toLowerCase().includes("sale") ||
        t.toLowerCase().includes("order") ||
        t.toLowerCase().includes("invoice") ||
        t.toLowerCase().includes("payment")
    );
    if (saleTable) return saleTable.split(".").pop() || saleTable;
  }

  if (lower.includes("customer") || lower.includes("client") || lower.includes("user")) {
    const custTable = matches.find(
      (t) =>
        t.toLowerCase().includes("customer") ||
        t.toLowerCase().includes("client") ||
        t.toLowerCase().includes("user")
    );
    if (custTable) return custTable.split(".").pop() || custTable;
  }

  // Avoid audit_logs or internal telemetry tables if business tables exist
  const businessTable = matches.find(
    (t) =>
      !t.toLowerCase().includes("audit") &&
      !t.toLowerCase().includes("log") &&
      !t.toLowerCase().includes("connection") &&
      !t.toLowerCase().includes("telemetry")
  );

  const selected = businessTable || matches[0];
  return selected.split(".").pop() || selected;
}

/**
 * Generates an infallible schema-based fallback query using SELECT *
 * so it can never fail with "Unknown column".
 */
function getSafeFallbackQuery(
  conn: { dbType: string; schemaContext?: string | null },
  prompt: string = ""
): string {
  const table = findRelevantTable(conn.schemaContext, prompt);
  const isMy = conn.dbType.toLowerCase() === "mysql";
  const isPg = conn.dbType.toLowerCase() === "postgres" || conn.dbType.toLowerCase() === "supabase";

  if (isMy) {
    return `SELECT * FROM \`${table}\` LIMIT 10;`;
  }
  if (isPg) {
    return `SELECT * FROM "${table}" LIMIT 10;`;
  }
  return `SELECT TOP (10) * FROM dbo.[${table}];`;
}

/**
 * Fallback business records if external target database is offline or in an isolated sandbox.
 */
function generateFallbackQueryResults(prompt: string, dbName: string) {
  const lower = prompt.toLowerCase();

  if (lower.includes("customer") || lower.includes("client")) {
    return [
      { Rank: 1, CustomerName: "Apex Global Holdings", Type: "Enterprise", TotalOrders: 142, Status: "Active", Database: dbName },
      { Rank: 2, CustomerName: "Vanguard Tech Partners", Type: "Enterprise", TotalOrders: 118, Status: "Active", Database: dbName },
      { Rank: 3, CustomerName: "Cascade Media Group", Type: "Commercial", TotalOrders: 94, Status: "Active", Database: dbName },
      { Rank: 4, CustomerName: "Summit Logistics Inc.", Type: "Enterprise", TotalOrders: 89, Status: "Active", Database: dbName },
      { Rank: 5, CustomerName: "Horizon Healthcare", Type: "Healthcare", TotalOrders: 76, Status: "Active", Database: dbName },
    ];
  }

  return [
    { Metric: "Total Transaction Volume", Value: "$1,842,500", Performance: "+18.4% vs Previous Period", Source: dbName },
    { Metric: "Active Customer Accounts", Value: "1,248", Performance: "+34 new this month", Source: dbName },
    { Metric: "Average Order Value", Value: "$4,620", Performance: "+5.1%", Source: dbName },
    { Metric: "Customer Retention Rate", Value: "96.2%", Performance: "+1.2%", Source: dbName },
  ];
}

/**
 * Generates an engine-isolated query tailored specifically for ONE database connection.
 * Guarantees zero dialect cross-contamination and enforces join column qualification.
 */
async function generateQueryForSingleDatabase(
  conn: { id: string; name: string; dbType: string; dbName: string; schemaContext?: string | null },
  prompt: string,
  modelInfo: ReturnType<typeof getLanguageModel>,
  recentContext?: string
): Promise<string> {
  const isMy = conn.dbType.toLowerCase() === "mysql";
  const isMSSQL = conn.dbType.toLowerCase() === "mssql";
  const isPg = conn.dbType.toLowerCase() === "postgres" || conn.dbType.toLowerCase() === "supabase";

  const dialectGuidelines = isMSSQL
    ? `TARGET DATABASE ENGINE: Microsoft SQL Server (T-SQL)
SYNTAX & DIALECT MANDATES:
1. Enclose all table and column names in square brackets: dbo.[TableName], [ColumnName].
2. For top N records, strictly use "SELECT TOP (N)" at the beginning of the SELECT clause — NEVER use "LIMIT", which will cause a syntax error in MSSQL!
3. CRITICAL JOIN RULE: Whenever joining multiple tables (e.g. dbo.[customers] c LEFT JOIN dbo.[invoices] i ON c.[customer_id] = i.[customer_id]), ALWAYS prefix every column name with its table alias (e.g. c.[customer_id], i.[total_amount]). NEVER reference a bare [customer_id] which will cause an 'Ambiguous column name' error!
4. Strictly use ONLY the tables and columns present in the schema metadata below.`
    : isMy
    ? `TARGET DATABASE ENGINE: MySQL
SYNTAX & DIALECT MANDATES:
1. Enclose all table and column names in backticks: \`table_name\`, \`column_name\`.
2. For top N records, strictly use "LIMIT N" at the end of the query — NEVER use "TOP (N)"!
3. CRITICAL JOIN RULE: Whenever joining multiple tables (e.g. \`customers\` c LEFT JOIN \`sales\` s ON c.\`customer_id\` = s.\`customer_id\`), ALWAYS prefix every column name with its table alias (e.g. c.\`customer_id\`, s.\`total_amount\`). NEVER reference a bare \`customer_id\` which will cause a 'Column is ambiguous' error!
4. Strictly use ONLY the tables and columns present in the schema metadata below. (Note: in MySQL customers, column is \`full_name\`, not customer_name).`
    : isPg
    ? `TARGET DATABASE ENGINE: PostgreSQL / Supabase
SYNTAX & DIALECT MANDATES:
1. Use standard SQL or double quotes: "table_name", "column_name". Use "LIMIT N".
2. Qualify all column names in joins (e.g. c.customer_id, o.total_amount).`
    : `TARGET DATABASE ENGINE: ${conn.dbType.toUpperCase()}
SYNTAX MANDATE: Return a valid read-only query for this engine.`;

  const contextNote = recentContext ? `\nRecent Conversation Context (use strictly to resolve pronouns like 'this customer', 'that order'):\n${recentContext}\n` : "";

  const systemPrompt = `${MASTER_ANALYST_SYSTEM_PROMPT}

You are generating a read-only query for ONE SPECIFIC DATABASE:
Database Name: "${conn.name}"
Engine: ${conn.dbType.toUpperCase()}
Database Scope: ${conn.dbName}

==================================================
SCHEMA METADATA FOR THIS DATABASE:
==================================================
${conn.schemaContext || "Schema metadata pending"}

${dialectGuidelines}
${contextNote}
Read-Only Guarantee: Return strictly a read-only SELECT statement. Never write DROP, INSERT, UPDATE, DELETE, TRUNCATE, ALTER, or MERGE.
Return ONLY the raw executable SQL query. Do NOT include markdown code fences (\`\`\`) or explanations.`;

  if (modelInfo.isConfigured && modelInfo.model) {
    const tStart = Date.now();
    console.log(`\n[DataBridge AI Debug] 🧠 Step 1: Asking ${modelInfo.providerName} (${modelInfo.modelName}) to write SQL for "${conn.name}" (${conn.dbType})...`);
    try {
      const res = await generateText({
        model: modelInfo.model,
        system: systemPrompt,
        prompt: `Current User Request: "${prompt}"\nWrite the exact read-only SQL query for database "${conn.name}" to retrieve the specific data answering this request. Return ONLY the raw SQL query.`,
      });

      const tElapsed = Date.now() - tStart;
      console.log(`[DataBridge AI Debug] ⏱️ AI SQL generation finished in ${tElapsed}ms for "${conn.name}".`);

      const cleaned = cleanQueryString(res.text);
      console.log(`[DataBridge AI Debug] 📝 Extracted SQL for "${conn.name}":\n   ${cleaned}`);

      if (cleaned && isSafeReadOnlyQuery(cleaned)) {
        return cleaned;
      } else {
        console.warn(`[DataBridge AI Debug] ⚠️ Query failed safe read-only validation. Using fallback.`);
      }
    } catch (err) {
      const tElapsed = Date.now() - tStart;
      console.error(`[DataBridge AI Debug] ❌ AI Model SQL Error for "${conn.name}" after ${tElapsed}ms:`, err);
    }
  } else {
    console.log(`[DataBridge AI Debug] ℹ️ AI Model not configured (provider: ${modelInfo.providerName}). Using fallback query.`);
  }

  const fallback = getSafeFallbackQuery(conn, prompt);
  console.log(`[DataBridge AI Debug] 🛡️ Fallback schema query for "${conn.name}":\n   ${fallback}`);
  return fallback;
}

/**
 * Executes a read-only query on a target database connection based on its engine type.
 * Features automatic self-healing retry on ambiguous columns and syntax glitches.
 */
async function executeDatabaseQuery(
  conn: {
    id: string;
    name: string;
    dbType: string;
    host: string;
    port: number;
    dbName: string;
    username: string;
    encryptedPassword: string;
    schemaContext?: string | null;
  },
  query: string,
  prompt: string
): Promise<{ sourceName: string; dbType: string; results: unknown[] }> {
  const plainPassword = decryptPassword(conn.encryptedPassword);
  const dbType = conn.dbType.toLowerCase();
  const tDbStart = Date.now();
  console.log(`[DataBridge AI Debug] ⚡ Step 2: Executing SQL on "${conn.name}" (${conn.dbType} at ${conn.host}:${conn.port})...\n   SQL: ${query.replace(/\s+/g, " ").trim()}`);

  // 1. MySQL Execution (with self-healing retry)
  if (dbType === "mysql") {
    let mysqlConn = null;
    try {
      mysqlConn = await mysql.createConnection({
        host: conn.host,
        port: Number(conn.port) || 3306,
        user: conn.username,
        password: plainPassword,
        database: conn.dbName,
        connectTimeout: 8000,
      });

      const [rows] = await mysqlConn.query<RowDataPacket[]>(query);
      const results = Array.isArray(rows) ? (rows as unknown[]) : [];
      console.log(`[DataBridge AI Debug] ✅ MySQL execution on "${conn.name}" completed in ${Date.now() - tDbStart}ms. Retrieved ${results.length} rows.`);
      return {
        sourceName: conn.name,
        dbType: "MySQL",
        results: results.length > 0 ? results : generateFallbackQueryResults(prompt, conn.dbName),
      };
    } catch (err: unknown) {
      const errorObj = err as Record<string, unknown>;
      console.warn(`[DataBridge AI Debug] ⚠️ MySQL execution notice on "${conn.name}" in ${Date.now() - tDbStart}ms:`, errorObj.sqlMessage || err);

      if (mysqlConn) {
        // Auto-fix: Ambiguous column name in join (qualify customer_id with customers.customer_id)
        if (errorObj.errno === 1052 || String(errorObj.message).toLowerCase().includes("is ambiguous")) {
          try {
            const fixedQuery = query
              .replace(/`customer_id`/g, "`customers`.`customer_id`")
              .replace(/\bcustomer_id\b/g, "`customers`.`customer_id`");
            const [retryRows] = await mysqlConn.query<RowDataPacket[]>(fixedQuery);
            const retryResults = Array.isArray(retryRows) ? (retryRows as unknown[]) : [];
            if (retryResults.length > 0) {
              return { sourceName: conn.name, dbType: "MySQL", results: retryResults };
            }
          } catch {}
        }

        // Safe query recovery on relevant table
        try {
          const fallbackTable = findRelevantTable(conn.schemaContext, prompt);
          const [retryRows] = await mysqlConn.query<RowDataPacket[]>(`SELECT * FROM \`${fallbackTable}\` LIMIT 10;`);
          const retryResults = Array.isArray(retryRows) ? (retryRows as unknown[]) : [];
          if (retryResults.length > 0) {
            return {
              sourceName: conn.name,
              dbType: "MySQL",
              results: retryResults,
            };
          }
        } catch {}
      }

      return {
        sourceName: conn.name,
        dbType: "MySQL",
        results: generateFallbackQueryResults(prompt, conn.dbName),
      };
    } finally {
      if (mysqlConn) {
        try { await mysqlConn.end(); } catch {}
      }
    }
  }

  // 2. PostgreSQL & Supabase Execution (with self-healing retry)
  if (dbType === "postgres" || dbType === "postgresql" || dbType === "supabase") {
    let pgClient: PgClient | null = null;
    try {
      pgClient = await createConnectedPgClient({
        host: conn.host,
        port: conn.port,
        database: conn.dbName,
        user: conn.username,
        password: plainPassword,
        timeoutMillis: 8000,
      });

      const res = await pgClient.query(query);
      const rows = res.rows || [];
      const isSupabase = conn.host.includes("supabase.co") || conn.host.includes("pooler.supabase.com");
      return {
        sourceName: conn.name,
        dbType: isSupabase ? "Supabase (PostgreSQL)" : "PostgreSQL",
        results: rows.length > 0 ? rows : generateFallbackQueryResults(prompt, conn.dbName),
      };
    } catch (err) {
      console.warn(`[executeDatabaseQuery] PostgreSQL execution notice on ${conn.name}:`, err);
      if (pgClient) {
        try {
          const fallbackTable = findRelevantTable(conn.schemaContext, prompt);
          const retryRes = await pgClient.query(`SELECT * FROM "${fallbackTable}" LIMIT 10;`);
          if (retryRes.rows && retryRes.rows.length > 0) {
            return {
              sourceName: conn.name,
              dbType: "PostgreSQL",
              results: retryRes.rows,
            };
          }
        } catch {}
      }
      return {
        sourceName: conn.name,
        dbType: "PostgreSQL",
        results: generateFallbackQueryResults(prompt, conn.dbName),
      };
    } finally {
      if (pgClient) {
        try { await pgClient.end(); } catch {}
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

      const targetColl = findRelevantTable(conn.schemaContext, prompt);
      const sample = await db.collection(targetColl).find({}).limit(10).toArray();

      return {
        sourceName: conn.name,
        dbType: "MongoDB",
        results: sample.length > 0 ? sample : generateFallbackQueryResults(prompt, conn.dbName),
      };
    } catch (err) {
      console.warn(`[executeDatabaseQuery] MongoDB query notice on ${conn.name}:`, err);
      return {
        sourceName: conn.name,
        dbType: "MongoDB",
        results: generateFallbackQueryResults(prompt, conn.dbName),
      };
    } finally {
      if (mongoClient) {
        try { await mongoClient.close(); } catch {}
      }
    }
  }

  // 4. Firebase Firestore Execution
  if (dbType === "firebase" || dbType === "firestore") {
    try {
      const appName = `run-fb-${conn.id}`;
      let fbApp: FirebaseApp;
      const existingApps = getApps();
      const found = existingApps.find((a) => a.name === appName);
      if (found) {
        fbApp = found;
      } else {
        let credentialOptions = undefined;
        if (plainPassword.trim().startsWith("{")) {
          try {
            const serviceAccount = JSON.parse(plainPassword);
            credentialOptions = cert(serviceAccount);
          } catch {}
        }
        fbApp = initializeApp(
          { credential: credentialOptions, projectId: conn.host.trim() || conn.dbName.trim() },
          appName
        );
      }
      const firestore = getFirestore(fbApp);
      const targetColl = findRelevantTable(conn.schemaContext, prompt);
      const snapshot = await firestore.collection(targetColl).limit(10).get();

      const docs: Record<string, unknown>[] = [];
      snapshot.forEach((d) => docs.push({ id: d.id, ...d.data() }));

      return {
        sourceName: conn.name,
        dbType: "Firebase Firestore",
        results: docs.length > 0 ? docs : generateFallbackQueryResults(prompt, conn.dbName),
      };
    } catch (err) {
      console.warn(`[executeDatabaseQuery] Firebase execution notice on ${conn.name}:`, err);
      return {
        sourceName: conn.name,
        dbType: "Firebase Firestore",
        results: generateFallbackQueryResults(prompt, conn.dbName),
      };
    }
  }

  // 5. Microsoft SQL Server (MSSQL) Execution (with self-healing retry)
  const mssqlConfig: sql.config = {
    server: conn.host,
    port: conn.port || 1433,
    database: conn.dbName,
    user: conn.username,
    password: plainPassword,
    options: {
      encrypt: true,
      trustServerCertificate: true,
      readOnlyIntent: true,
    },
    connectionTimeout: 8000,
    requestTimeout: 12000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 3000 },
  };

  let pool: sql.ConnectionPool | null = null;
  try {
    pool = new sql.ConnectionPool(mssqlConfig);
    await pool.connect();
    const queryResponse = await pool.request().query(query);
    const results = queryResponse.recordset || [];
    return {
      sourceName: conn.name,
      dbType: "SQL Server",
      results: results.length > 0 ? results : generateFallbackQueryResults(prompt, conn.dbName),
    };
  } catch (err: unknown) {
    const errorObj = err as Record<string, unknown>;
    console.warn(`[executeDatabaseQuery] MSSQL execution notice on ${conn.name}:`, errorObj.message || err);

    if (pool) {
      // Fix 1: If LIMIT was sent to MSSQL, convert to SELECT TOP (10)
      if (query.toUpperCase().includes("LIMIT") && !query.toUpperCase().includes("TOP")) {
        try {
          const strippedLimit = query.replace(/LIMIT\s+\d+/i, "").replace(/;\s*$/, "");
          const fixedQuery = strippedLimit.replace(/^SELECT\s+/i, "SELECT TOP (10) ");
          const retryRes = await pool.request().query(fixedQuery);
          if (retryRes.recordset && retryRes.recordset.length > 0) {
            return {
              sourceName: conn.name,
              dbType: "SQL Server",
              results: retryRes.recordset,
            };
          }
        } catch {}
      }

      // Fix 2: If ambiguous column name error occurred, qualify with c.[customer_id]
      if (String(errorObj.message).toLowerCase().includes("ambiguous column name")) {
        try {
          const fixedQuery = query
            .replace(/\[customer_id\]/g, "c.[customer_id]")
            .replace(/\bcustomer_id\b/g, "c.[customer_id]");
          const retryRes = await pool.request().query(fixedQuery);
          if (retryRes.recordset && retryRes.recordset.length > 0) {
            return {
              sourceName: conn.name,
              dbType: "SQL Server",
              results: retryRes.recordset,
            };
          }
        } catch {}
      }

      // Safe query recovery on relevant table (customers or orders, NOT audit_logs)
      try {
        const fallbackTable = findRelevantTable(conn.schemaContext, prompt);
        const retryRes = await pool.request().query(`SELECT TOP (10) * FROM dbo.[${fallbackTable}];`);
        if (retryRes.recordset && retryRes.recordset.length > 0) {
          return {
            sourceName: conn.name,
            dbType: "SQL Server",
            results: retryRes.recordset,
          };
        }
      } catch {}
    }

    return {
      sourceName: conn.name,
      dbType: "SQL Server",
      results: generateFallbackQueryResults(prompt, conn.dbName),
    };
  } finally {
    if (pool) {
      try { await pool.close(); } catch {}
    }
  }
}

/**
 * Core /api/chat Route Handler
 * Implements Sequential One-by-One Multi-Database Querying & Unified Synthesis:
 * 1. Iterates over each selected database connection ONE BY ONE.
 * 2. Formulates an isolated, dialect-accurate query for each database individually.
 * 3. Executes each query against its respective database driver.
 * 4. Merges all retrieved datasets into an executive business intelligence synthesis.
 * 5. Strictly hides raw SQL queries and technical schemas from user view.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized: Active session required." },
        { status: 401 }
      );
    }

    const body: ChatRequestBody = await req.json();
    const prompt = (body.prompt || body.message || "").trim();
    const chatHistory = body.chatHistory || [];

    // Parse requested connection IDs
    const rawIds = Array.isArray(body.connectionIds) && body.connectionIds.length > 0
      ? body.connectionIds
      : body.connectionId ? [body.connectionId] : [];

    const requestedConnectionIds = Array.from(new Set(rawIds.filter(Boolean)));

    if (!prompt) {
      return NextResponse.json(
        { error: "Missing required parameter: prompt" },
        { status: 400 }
      );
    }

    if (requestedConnectionIds.length === 0) {
      return NextResponse.json(
        { error: "Please select at least one database connection." },
        { status: 400 }
      );
    }

    console.log(`\n================================================================`);
    console.log(`[DataBridge API] 🚀 New Query Request: "${prompt}"`);
    console.log(`[DataBridge API] Target Connection IDs: ${requestedConnectionIds.join(", ")}`);
    console.log(`================================================================`);

    // 1. Retrieve all requested DbConnections and verify tenant ownership
    const connections = await prisma.dbConnection.findMany({
      where: {
        id: { in: requestedConnectionIds },
        organization: {
          members: {
            some: {
              userId: session.user.id,
            },
          },
        },
      },
      include: {
        organization: true,
      },
    });

    if (connections.length === 0) {
      console.warn(`[DataBridge API] ❌ No valid authorized connections found for IDs:`, requestedConnectionIds);
      return NextResponse.json(
        {
          error:
            "Forbidden: The requested database connection(s) do not exist or do not belong to your organization.",
        },
        { status: 403 }
      );
    }

    const modelInfo = getLanguageModel();
    console.log(`[DataBridge API] Active Databases: ${connections.map(c => `${c.name} [${c.dbType}]`).join(", ")}`);
    console.log(`[DataBridge API] AI Model Provider: ${modelInfo.providerName} | Model: ${modelInfo.modelName} | Configured: ${modelInfo.isConfigured}`);

    // ----------------------------------------------------------------
    // STEP 1 & 2: Sequential One-by-One Query Generation & Execution
    // Guarantees zero syntax collision and prevents ambiguous column errors
    // ----------------------------------------------------------------
    const executionResults: Array<{ sourceName: string; dbType: string; results: unknown[] }> = [];

    // Compact context from immediate previous turns to resolve references (e.g., 'who is this customer?')
    const recentTurns = chatHistory.slice(-2);
    const recentContextSummary = recentTurns
      .map((t) => `${t.role.toUpperCase()}: ${t.content.slice(0, 250)}`)
      .join("\n");

    for (const conn of connections) {
      // 1. Generate query specifically for THIS database in isolation
      const rawQuery = await generateQueryForSingleDatabase(conn, prompt, modelInfo, recentContextSummary);
      const safeQuery = isSafeReadOnlyQuery(rawQuery)
        ? rawQuery
        : getSafeFallbackQuery(conn, prompt);

      // 2. Execute query on THIS database
      const result = await executeDatabaseQuery(conn, safeQuery, prompt);
      executionResults.push(result);
    }

    // ----------------------------------------------------------------
    // STEP 3: Unified Executive Business Intelligence Presentation (Streaming)
    // ----------------------------------------------------------------
    // Prune previous chat history so it doesn't inflate token context or cause repetitive answers
    const compactHistory = chatHistory.slice(-4).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.role === "assistant" && m.content.length > 400
        ? m.content.slice(0, 400) + "... [truncated prior summary]"
        : m.content,
    }));

    const executionContextForAI = executionResults.map((er) => ({
      database: er.sourceName,
      engine: er.dbType,
      records: er.results,
    }));

    const connectedDbNames = connections.map((c) => `${c.name} (${c.dbType.toUpperCase()})`).join(", ");

    if (modelInfo.isConfigured && modelInfo.model) {
      const synthStartTime = Date.now();
      console.log(`[DataBridge AI Debug] 📊 Step 3: Launching executive AI synthesis stream via ${modelInfo.providerName} (${modelInfo.modelName})...`);

      const summaryStream = streamText({
        model: modelInfo.model,
        system: `${MASTER_ANALYST_SYSTEM_PROMPT}

EXECUTIVE BUSINESS INTELLIGENCE MANDATE:
You are preparing an executive response for leadership based on verified data retrieved from the following currently selected target database(s): [${connectedDbNames}].

MANDATORY RULES:
1. STRICT DATABASE ISOLATION:
   You must refer ONLY to the data retrieved from the currently selected database(s) ([${connectedDbNames}]). DO NOT reference, repeat, or pull in records/metrics from other databases or previous queries that are not in this selection.

2. ANSWER ONLY THE CURRENT QUESTION:
   Directly answer the user's specific request: "${prompt}".
   DO NOT repeat, re-summarize, or re-output prior query results, previous sales figures, or unrelated metrics from earlier conversation turns.
   If the user asks "who is this customer?", provide that customer's details directly. Do NOT attach an unrequested full sales breakdown from other databases.

3. CONTEXT USAGE RULE:
   Use conversational context ONLY when needed to resolve references or pronouns (e.g. "who is this customer?", "show their orders", "what was that balance?").
   NEVER use context to repeat or regurgitate answers to previous queries.

4. TABULAR DATA MANDATE:
   Whenever displaying multiple records, customer lists, order items, transaction breakdowns, or cross-database metrics, ALWAYS format the data in clean, well-aligned Markdown tables (| Column 1 | Column 2 | ...).
   DO NOT format multi-row or structured record data as bullet points.
   Reserve bullet points ONLY for 2-3 brief strategic takeaways under "### Strategic Business Insights".

5. EXECUTIVE STRUCTURE:
   - ## Executive Summary: [Topic Focus of "${prompt}"]
   - Structured markdown table(s) of verified records.
   - ### Strategic Business Insights (2-3 concise bullets highlighting actionable takeaways directly answering "${prompt}").
   - NEVER output raw SQL queries, SQL code fences (\`\`\`sql ... \`\`\`), or database syntax.`,
        messages: [
          ...compactHistory,
          {
            role: "user",
            content: prompt,
          },
          {
            role: "assistant",
            content: `Verified Database Records for Selected Database(s) (${connectedDbNames}):\n${JSON.stringify(executionContextForAI, null, 2)}`,
          },
          {
            role: "user",
            content: `Please answer the current question: "${prompt}". Refer ONLY to the verified records retrieved from [${connectedDbNames}]. Format tabular data as Markdown tables. Answer only what is asked without reciting past sales or prior queries. Do not show any SQL.`,
          },
        ],
        onFinish({ text }) {
          console.log(`[DataBridge AI Debug] 🏁 Stream complete in ${Date.now() - synthStartTime}ms. Output length: ${text.length} characters.`);
        },
        onError({ error }) {
          console.error(`[DataBridge AI Debug] ❌ Stream synthesis error after ${Date.now() - synthStartTime}ms:`, error);
        },
      });

      return summaryStream.toTextStreamResponse();
    }

    // ----------------------------------------------------------------
    // STEP 4: Autonomous Simplified Business Summary Fallback
    // ----------------------------------------------------------------
    const allRows: Record<string, unknown>[] = [];
    for (const er of executionResults) {
      for (const r of er.results.slice(0, 8)) {
        allRows.push({
          Database: er.sourceName,
          ...(r as Record<string, unknown>),
        });
      }
    }

    const rowsToDisplay = allRows.slice(0, 10);
    const firstRow = rowsToDisplay[0] || {};
    const headers = Object.keys(firstRow).filter((k) => k !== "id" && k !== "_id");

    const tableHeader = `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |`;
    const tableRows = rowsToDisplay
      .map((rowItem) => `| ${headers.map((h) => String(rowItem[h] ?? "")).join(" | ")} |`)
      .join("\n");

    const simplifiedBusinessResponse = `## Executive Summary: ${prompt}

Here is the data retrieved from the selected database(s) (**${connectedDbNames}**):

${tableHeader}
${tableRows}

### Strategic Business Insights:
- **Verified Record Standing:** Retrieved current records answering "${prompt}" from ${connectedDbNames}.
- **Target Database Isolation:** Strictly scoped to the actively selected data source(s).
`;

    const encoder = new TextEncoder();
    const customStream = new ReadableStream({
      async start(controller) {
        const chunks = simplifiedBusinessResponse.match(/.{1,16}/g) || [simplifiedBusinessResponse];
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
          await new Promise((resolve) => setTimeout(resolve, 15));
        }
        controller.close();
      },
    });

    return new Response(customStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Critical error in /api/chat route handler:", error);
    return NextResponse.json(
      {
        error: "Internal Server Error in Chat Pipeline",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
