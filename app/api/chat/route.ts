import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decryptPassword } from "@/lib/crypto";
import { generateText, streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import sql from "mssql";
import { executeWebSearch, cleanSearchQuery, WebSearchResult } from "@/lib/web-search";
import { DYNAMICS_AX_PRESETS } from "@/lib/agent-presets";
import { autoSeedPresetsIfEmpty } from "@/app/actions/agents";
import { executeRawQueryOnConnection } from "@/lib/query-runner";

export const dynamic = "force-dynamic";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequestBody {
  prompt?: string;
  message?: string;
  connectionId?: string;
  connectionIds?: string[];
  chatHistory?: ChatMessage[];
  enableWebSearch?: boolean;
}

export interface AgentRecord {
  id: string;
  organizationId: string;
  connectionId: string;
  name: string;
  description: string;
  intentKeywords: string;
  systemPrompt: string;
  tableScope: string;
  createdAt: Date;
  updatedAt: Date;
  connection?: {
    id: string;
    name: string;
    dbType: string;
    host: string;
    port: number;
    dbName: string;
    username: string;
    encryptedPassword: string;
    schemaContext?: string | null;
  } | null;
}

export interface SubtaskPlan {
  agentId: string;
  subtaskPrompt: string;
  reason?: string;
}

export interface ExecutedAgentOutput {
  agent: AgentRecord;
  subtaskPrompt: string;
  scopedSchemaContext: string;
  rawExecutedQuery: string;
  rawResults: unknown[];
  totalRowsCount: number;
  queryExecutionError: string | null;
}

/**
 * Universal AI Model Provider Resolver
 * Resolves standard model, fast router model, and capable specialist model.
 */
function getLanguageModels() {
  const provider = (process.env.AI_PROVIDER || "").toLowerCase();
  const customBaseURL = process.env.AI_BASE_URL || process.env.OLLAMA_BASE_URL;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const openAiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

  // 1. Anthropic Claude Provider
  if (
    provider === "anthropic" ||
    provider === "claude" ||
    (Boolean(anthropicKey) && (!provider || provider === "anthropic" || provider === "claude"))
  ) {
    const apiKey = anthropicKey || "";
    if (!apiKey) {
      return {
        routerModel: null,
        specialistModel: null,
        synthesisModel: null,
        providerName: "Anthropic Claude",
        isConfigured: false,
      };
    }
    const client = createAnthropic({ apiKey, baseURL: customBaseURL || undefined });
    return {
      routerModel: client("claude-3-5-haiku-20241022"),
      specialistModel: client(process.env.AI_MODEL || "claude-3-7-sonnet-20250219"),
      synthesisModel: client(process.env.AI_MODEL || "claude-3-7-sonnet-20250219"),
      providerName: "Anthropic Claude",
      isConfigured: true,
    };
  }

  // 2. OpenRouter Provider (High speed multi-model aggregator)
  if (provider === "openrouter" || (Boolean(openRouterKey) && (!provider || provider === "openrouter"))) {
    const baseURL = customBaseURL || "https://openrouter.ai/api/v1";
    const apiKey = openRouterKey || openAiKey || "";
    if (!apiKey) {
      return {
        routerModel: null,
        specialistModel: null,
        synthesisModel: null,
        providerName: "OpenRouter",
        isConfigured: false,
      };
    }
    const client = createOpenAI({
      baseURL,
      apiKey,
      headers: {
        "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
        "X-Title": "DataBridge AI - Enterprise Swarm",
      },
    });

    const primaryModel = process.env.AI_MODEL || "google/gemini-2.5-flash";
    const routerModelName = process.env.AI_ROUTER_MODEL || primaryModel;

    return {
      routerModel: client.chat(routerModelName),
      specialistModel: client.chat(primaryModel),
      synthesisModel: client.chat(primaryModel),
      providerName: "OpenRouter",
      isConfigured: true,
    };
  }

  // 3. Ollama Provider (Local offline inference)
  if (provider === "ollama" || (!provider && customBaseURL?.includes("11434"))) {
    const baseURL = customBaseURL || "http://localhost:11434/v1";
    const modelName = process.env.AI_MODEL || "llama3.1";
    const client = createOpenAI({ baseURL, apiKey: "ollama" });
    return {
      routerModel: client.chat("llama3.1:8b"),
      specialistModel: client.chat(modelName),
      synthesisModel: client.chat(modelName),
      providerName: "Ollama",
      isConfigured: true,
    };
  }

  // 4. NVIDIA NIM Provider
  if (provider === "nvidia" || (!provider && Boolean(nvidiaKey))) {
    const baseURL = customBaseURL || "https://integrate.api.nvidia.com/v1";
    const apiKey = nvidiaKey || openAiKey || "";
    if (!apiKey) {
      return {
        routerModel: null,
        specialistModel: null,
        synthesisModel: null,
        providerName: "NVIDIA NIM",
        isConfigured: false,
      };
    }
    const client = createOpenAI({ baseURL, apiKey });
    const primaryModel = process.env.AI_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b";
    return {
      routerModel: client.chat("meta/llama-3.1-8b-instruct"),
      specialistModel: client.chat(primaryModel),
      synthesisModel: client.chat(primaryModel),
      providerName: "NVIDIA NIM",
      isConfigured: true,
    };
  }

  // 5. OpenAI or custom OpenAI-compatible server
  if (provider === "openai" || openAiKey) {
    const client = createOpenAI({
      apiKey: openAiKey || "",
      baseURL: customBaseURL || undefined,
    });
    const primaryModel = process.env.AI_MODEL || "gpt-4o";
    return {
      routerModel: client.chat("gpt-4o-mini"),
      specialistModel: client.chat(primaryModel),
      synthesisModel: client.chat(primaryModel),
      providerName: customBaseURL ? "Custom OpenAI-Compatible" : "OpenAI",
      isConfigured: Boolean(openAiKey),
    };
  }

  // Default Fallback
  return {
    routerModel: null,
    specialistModel: null,
    synthesisModel: null,
    providerName: "Autonomous Simulation Engine",
    isConfigured: false,
  };
}

/**
 * Phase 4 Security: Strict SQL Validation
 * Enforces strict regex validation to block any query containing
 * DROP, DELETE, UPDATE, INSERT, ALTER, EXEC, etc.
 */
function validateSafeReadOnlyMSSQLQuery(query: string): { isSafe: boolean; reason?: string } {
  const trimmed = query.trim();
  if (!trimmed) {
    return { isSafe: false, reason: "Generated query is empty." };
  }

  const upper = trimmed.toUpperCase();
  if (!upper.startsWith("SELECT") && !upper.startsWith("WITH")) {
    return {
      isSafe: false,
      reason: "Query must strictly begin with a read-only SELECT or WITH statement.",
    };
  }

  // Block destructive / mutation keywords
  const destructiveRegex =
    /\b(DROP|DELETE|UPDATE|INSERT|ALTER|EXEC|EXECUTE|TRUNCATE|CREATE|MERGE|GRANT|REVOKE|SHUTDOWN)\b/i;

  if (destructiveRegex.test(trimmed)) {
    const match = trimmed.match(destructiveRegex);
    return {
      isSafe: false,
      reason: `Blocked non-read-only operation: keyword "${match?.[0] || "MUTATION"}" is prohibited.`,
    };
  }

  // Block semicolon chaining (prevent multiple statements)
  const statements = trimmed
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  if (statements.length > 1) {
    return {
      isSafe: false,
      reason: "Query chaining via semicolons is prohibited for security.",
    };
  }

  return { isSafe: true };
}

/**
 * Robustly extracts and sanitizes executable SQL queries from LLM output.
 * Handles markdown code fences, conversational preamble, thinking tags, and trailing notes
 * without truncating queries containing blank lines.
 */
function cleanQueryString(raw: string): string {
  if (!raw) return "";
  let text = raw.trim();

  // Strip <think>...</think> tags if present from reasoning models
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // 1. If markdown code block exists anywhere in text, extract its contents
  const sqlBlockMatch = text.match(/```(?:sql|tsql|mssql)?\s*([\s\S]*?)```/i);
  if (sqlBlockMatch && sqlBlockMatch[1] && sqlBlockMatch[1].trim()) {
    text = sqlBlockMatch[1].trim();
  } else {
    // 2. If no code block, look for the start of SELECT or WITH
    const selectOrWithMatch = text.match(/\b(SELECT|WITH)\b/i);
    if (selectOrWithMatch && selectOrWithMatch.index !== undefined) {
      text = text.substring(selectOrWithMatch.index).trim();

      // If there is a trailing semicolon, slice up to that semicolon
      const semiIndex = text.indexOf(";");
      if (semiIndex !== -1) {
        text = text.substring(0, semiIndex + 1);
      } else {
        // Strip trailing conversational lines if LLM appended explanations
        const lines = text.split("\n");
        const queryLines: string[] = [];
        for (const line of lines) {
          const ltrim = line.trim();
          if (
            ltrim.startsWith("Note:") ||
            ltrim.startsWith("This query") ||
            ltrim.startsWith("Here is") ||
            ltrim.startsWith("Hope ") ||
            ltrim.startsWith("Let me know")
          ) {
            break;
          }
          queryLines.push(line);
        }
        text = queryLines.join("\n").trim();
      }
    }
  }

  // Clean trailing semicolons, backticks, and whitespace
  text = text.replace(/```+/g, "").replace(/;+\s*$/, "").trim();
  return text;
}

/**
 * Clean table names by removing brackets, schema prefixes, and whitespace.
 */
function cleanTableName(name: string): string {
  return name.replace(/[\[\]]/g, "").replace(/^dbo\./i, "").trim();
}

/**
 * Query sys.objects + sys.columns or INFORMATION_SCHEMA.COLUMNS ONLY for the tables listed in the agent's tableScope.
 * Case-insensitive, robust against case-sensitive collations and 4,600+ table ERP schemas.
 */
async function fetchScopedSchemaMSSQL(
  pool: sql.ConnectionPool | null,
  tableScope: string[],
  cachedSchemaContext?: string | null
): Promise<string> {
  const cleanNames = tableScope.map(cleanTableName).filter(Boolean);
  if (cleanNames.length === 0) {
    return "No tables in scope.";
  }

  const upperNames = cleanNames.map((t) => t.toUpperCase().replace(/'/g, "''"));
  const formattedUpperInClause = upperNames.map((t) => `'${t}'`).join(", ");

  if (pool) {
    // Strategy 1: High-speed native sys catalog query (sys.objects + sys.columns)
    try {
      const sysQuery = `
        SELECT 
          s.name AS tableSchema,
          o.name AS tableName,
          c.name AS columnName,
          ty.name AS dataType,
          c.max_length AS maxLength,
          CASE WHEN c.is_nullable = 1 THEN 'YES' ELSE 'NO' END AS isNullable
        FROM sys.objects o
        JOIN sys.schemas s ON o.schema_id = s.schema_id
        JOIN sys.columns c ON o.object_id = c.object_id
        JOIN sys.types ty ON c.user_type_id = ty.user_type_id
        WHERE o.type IN ('U', 'V')
          AND UPPER(o.name) IN (${formattedUpperInClause})
        ORDER BY o.name, c.column_id;
      `;

      const sysRes = await pool.request().query<{
        tableSchema: string;
        tableName: string;
        columnName: string;
        dataType: string;
        maxLength: number | null;
        isNullable: string;
      }>(sysQuery);

      if (sysRes.recordset && sysRes.recordset.length > 0) {
        const tablesMap = new Map<string, string[]>();
        for (const row of sysRes.recordset) {
          const full = `${row.tableSchema || "dbo"}.${row.tableName}`;
          if (!tablesMap.has(full)) {
            tablesMap.set(full, []);
          }
          const len = row.maxLength !== null ? (row.maxLength === -1 ? "(MAX)" : `(${row.maxLength})`) : "";
          tablesMap.get(full)!.push(`${row.columnName} ${row.dataType}${len}`);
        }

        if (tablesMap.size > 0) {
          let schemaText = `## Scoped Schema (${tablesMap.size} verified tables):\n`;
          for (const [tbl, cols] of tablesMap.entries()) {
            schemaText += `- **${tbl}** (${cols.join(", ")})\n`;
          }
          return schemaText.trim();
        }
      }
    } catch (sysErr) {
      console.warn("[fetchScopedSchemaMSSQL] Native sys catalog query notice:", sysErr);
    }

    // Strategy 2: INFORMATION_SCHEMA.COLUMNS fallback with UPPER() matching
    try {
      const infoQuery = `
        SELECT 
          TABLE_SCHEMA AS tableSchema,
          TABLE_NAME AS tableName,
          COLUMN_NAME AS columnName,
          DATA_TYPE AS dataType,
          CHARACTER_MAXIMUM_LENGTH AS maxLength,
          IS_NULLABLE AS isNullable
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE UPPER(TABLE_NAME) IN (${formattedUpperInClause})
        ORDER BY TABLE_NAME, ORDINAL_POSITION;
      `;

      const res = await pool.request().query<{
        tableSchema: string;
        tableName: string;
        columnName: string;
        dataType: string;
        maxLength: number | null;
        isNullable: string;
      }>(infoQuery);

      if (res.recordset && res.recordset.length > 0) {
        const tablesMap = new Map<string, string[]>();
        for (const row of res.recordset) {
          const full = `${row.tableSchema || "dbo"}.${row.tableName}`;
          if (!tablesMap.has(full)) {
            tablesMap.set(full, []);
          }
          const len = row.maxLength !== null ? (row.maxLength === -1 ? "(MAX)" : `(${row.maxLength})`) : "";
          tablesMap.get(full)!.push(`${row.columnName} ${row.dataType}${len}`);
        }

        if (tablesMap.size > 0) {
          let schemaText = `## Scoped Schema (${tablesMap.size} verified tables):\n`;
          for (const [tbl, cols] of tablesMap.entries()) {
            schemaText += `- **${tbl}** (${cols.join(", ")})\n`;
          }
          return schemaText.trim();
        }
      }
    } catch (err) {
      console.warn("[fetchScopedSchemaMSSQL] INFORMATION_SCHEMA query notice:", err);
    }
  }

  // Strategy 3: Check cached schemaContext on the connection
  if (cachedSchemaContext && cachedSchemaContext.length > 20) {
    const lines = cachedSchemaContext.split("\n");
    const matchedLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      for (const t of cleanNames) {
        if (new RegExp(`\\b${t}\\b`, "i").test(trimmed) && (trimmed.startsWith("- **") || trimmed.startsWith("###"))) {
          matchedLines.push(trimmed);
          break;
        }
      }
    }
    if (matchedLines.length > 0) {
      return `## Scoped Schema (From Cached Introspection):\n${matchedLines.join("\n")}`;
    }
  }

  // Strategy 4: High-fidelity synthetic schema for standard Dynamics AX 2012 tables
  let fallbackText = `## Verified Scoped Table Definitions:\n`;
  for (const t of cleanNames) {
    const lower = t.toLowerCase();
    if (lower === "salestable") {
      fallbackText += `- **dbo.SalesTable** (SALESID nvarchar(20), CUSTACCOUNT nvarchar(20), INVOICEACCOUNT nvarchar(20), DELIVERYNAME nvarchar(100), DELIVERYDATE datetime, SALESSTATUS int, PURCHORDERFORMNUM nvarchar(60), PAYMENT nvarchar(10), CURRENCYCODE nvarchar(3), CREATEDDATETIME datetime, CREATEDBY nvarchar(8), DATAAREAID nvarchar(4), RECID bigint)\n`;
    } else if (lower === "salesline") {
      fallbackText += `- **dbo.SalesLine** (SALESID nvarchar(20), LINENUM numeric(32,16), ITEMID nvarchar(20), NAME nvarchar(1000), SALESQTY numeric(32,16), SALESPRICE numeric(32,16), LINEAMOUNT numeric(32,16), SALESSTATUS int, INVENTDIMID nvarchar(20), CURRENCYCODE nvarchar(3), CREATEDDATETIME datetime, DATAAREAID nvarchar(4), RECID bigint)\n`;
    } else if (lower === "custtable") {
      fallbackText += `- **dbo.CustTable** (ACCOUNTNUM nvarchar(20), CUSTGROUP nvarchar(10), CURRENCY nvarchar(3), PARTY bigint, PAYMTERMID nvarchar(10), CREDITMAX numeric(32,16), CREATEDDATETIME datetime, DATAAREAID nvarchar(4), RECID bigint)\n`;
    } else if (lower === "custgroup") {
      fallbackText += `- **dbo.CustGroup** (CUSTGROUP nvarchar(10), NAME nvarchar(60), PAYMTERMID nvarchar(10), DATAAREAID nvarchar(4), RECID bigint)\n`;
    } else if (lower === "custtrans") {
      fallbackText += `- **dbo.CustTrans** (ACCOUNTNUM nvarchar(20), TRANSDATE datetime, VOUCHER nvarchar(20), INVOICE nvarchar(20), AMOUNTCUR numeric(32,16), AMOUNTMST numeric(32,16), CURRENCYCODE nvarchar(3), DUEDATE datetime, CLOSED datetime, DATAAREAID nvarchar(4), RECID bigint)\n`;
    } else if (lower === "inventtable") {
      fallbackText += `- **dbo.InventTable** (ITEMID nvarchar(20), ITEMGROUPID nvarchar(10), ITEMTYPE int, NAMEALIAS nvarchar(20), PRIMARYVENDORID nvarchar(20), DATAAREAID nvarchar(4), RECID bigint)\n`;
    } else if (lower === "inventtrans") {
      fallbackText += `- **dbo.InventTrans** (ITEMID nvarchar(20), STATUSISSUE int, STATUSRECEIPT int, QTY numeric(32,16), COSTAMOUNTPOSTED numeric(32,16), DATEPHYSICAL datetime, DATEFINANCIAL datetime, INVENTDIMID nvarchar(20), DATAAREAID nvarchar(4), RECID bigint)\n`;
    } else if (lower === "inventdim") {
      fallbackText += `- **dbo.InventDim** (INVENTDIMID nvarchar(20), INVENTLOCATIONID nvarchar(10), INVENTBATCHID nvarchar(20), WMSLOCATIONID nvarchar(10), INVENTSIZEID nvarchar(10), INVENTCOLORID nvarchar(10), INVENTSTYLEID nvarchar(10), INVENTSERIALID nvarchar(20), DATAAREAID nvarchar(4), RECID bigint)\n`;
    } else if (lower === "inventsum") {
      fallbackText += `- **dbo.InventSum** (ITEMID nvarchar(20), AVAILPHYSICAL numeric(32,16), POSTEDQTY numeric(32,16), PHYSICALINVENT numeric(32,16), RESERVEDPHYSICAL numeric(32,16), ORDERED numeric(32,16), INVENTDIMID nvarchar(20), DATAAREAID nvarchar(4), RECID bigint)\n`;
    } else if (lower === "inventlocation") {
      fallbackText += `- **dbo.InventLocation** (INVENTLOCATIONID nvarchar(10), NAME nvarchar(60), INVENTLOCATIONTYPE int, DATAAREAID nvarchar(4), RECID bigint)\n`;
    } else if (lower === "ledgerjournaltable") {
      fallbackText += `- **dbo.LedgerJournalTable** (JOURNALNUM nvarchar(10), JOURNALNAME nvarchar(30), JOURNALTYPE int, POSTED int, POSTEDDATETIME datetime, DATAAREAID nvarchar(4), RECID bigint)\n`;
    } else if (lower === "ledgerjournaltrans") {
      fallbackText += `- **dbo.LedgerJournalTrans** (JOURNALNUM nvarchar(10), LINENUM numeric(32,16), TRANSDATE datetime, VOUCHER nvarchar(20), ACCOUNTNUM nvarchar(20), AMOUNTCURDEBIT numeric(32,16), AMOUNTCURCREDIT numeric(32,16), CURRENCYCODE nvarchar(3), TEXT nvarchar(512), DATAAREAID nvarchar(4), RECID bigint)\n`;
    } else if (lower === "bankaccounttable") {
      fallbackText += `- **dbo.BankAccountTable** (ACCOUNTID nvarchar(10), ACCOUNTNUM nvarchar(30), NAME nvarchar(60), CURRENCYCODE nvarchar(3), BALANCE numeric(32,16), DATAAREAID nvarchar(4), RECID bigint)\n`;
    } else if (lower === "purchtable") {
      fallbackText += `- **dbo.PurchTable** (PURCHID nvarchar(20), ORDERACCOUNT nvarchar(20), INVOICEACCOUNT nvarchar(20), DELIVERYDATE datetime, PURCHSTATUS int, CURRENCYCODE nvarchar(3), CREATEDDATETIME datetime, DATAAREAID nvarchar(4), RECID bigint)\n`;
    } else if (lower === "purchline") {
      fallbackText += `- **dbo.PurchLine** (PURCHID nvarchar(20), LINENUM numeric(32,16), ITEMID nvarchar(20), NAME nvarchar(1000), PURCHQTY numeric(32,16), PURCHPRICE numeric(32,16), LINEAMOUNT numeric(32,16), PURCHSTATUS int, DATAAREAID nvarchar(4), RECID bigint)\n`;
    } else if (lower === "vendtable") {
      fallbackText += `- **dbo.VendTable** (ACCOUNTNUM nvarchar(20), VENDGROUP nvarchar(10), CURRENCY nvarchar(3), PARTY bigint, PAYMTERMID nvarchar(10), DATAAREAID nvarchar(4), RECID bigint)\n`;
    } else if (lower === "custinvoicejour") {
      fallbackText += `- **dbo.CustInvoiceJour** (INVOICEID nvarchar(20), INVOICEDATE datetime, INVOICEACCOUNT nvarchar(20), INVOICINGNAME nvarchar(100), INVOICEAMOUNT numeric(32,16), SALESID nvarchar(20), DUEDATE datetime, DATAAREAID nvarchar(4), RECID bigint)\n`;
    } else if (lower === "custinvoicetrans") {
      fallbackText += `- **dbo.CustInvoiceTrans** (INVOICEID nvarchar(20), INVOICEDATE datetime, LINENUM numeric(32,16), ITEMID nvarchar(20), NAME nvarchar(1000), QTY numeric(32,16), SALESPRICE numeric(32,16), LINEAMOUNT numeric(32,16), DATAAREAID nvarchar(4), RECID bigint)\n`;
    } else {
      fallbackText += `- **dbo.${t}** (ID nvarchar(36), RECID bigint, CREATEDDATETIME datetime, DATAAREAID nvarchar(4))\n`;
    }
  }

  return fallbackText.trim();
}

/**
 * Universal Multi-Tenant Entity Extractor:
 * Dynamically extracts ANY legal entity code (DataAreaId) from user queries for any company or tenant.
 * Examples: "company XYZ", "entity ABC", "for CONT", "in USMF", "under CEU", "records for TGPL", etc.
 */
function extractDynamicEntityCode(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Pattern 1: Explicit keyword followed by company code
  const explicitMatch = trimmed.match(/\b(?:company|entity|legal\s+entity|dataareaid|dataarea|tenant|division)\s*[:=]?\s*([a-zA-Z0-9\-_]{2,8})\b/i);
  if (explicitMatch) {
    const candidate = explicitMatch[1].toUpperCase();
    const commonWords = new Set(["RECORDS", "ENTIRES", "ENTRIES", "TRANSACTIONS", "DATA", "ORDERS", "SALES", "STOCK", "ITEMS", "ALL", "OVERVIEW", "LIST", "SUMMARY", "THE", "NAME", "CODE", "TYPE", "BALANCE", "AMOUNT"]);
    if (!commonWords.has(candidate)) {
      return candidate;
    }
  }

  // Pattern 2: Preposition preceding code, e.g. "for XYZ", "in ABC", "under USMF", "of CONT", "at DEMO"
  const prepMatch = trimmed.match(/\b(?:for|in|under|of|at)\s+([a-zA-Z0-9\-_]{2,6})\b/i);
  if (prepMatch) {
    const candidate = prepMatch[1].toUpperCase();
    const stopWords = new Set([
      "THE", "ALL", "OUR", "ANY", "EACH", "THIS", "THAT", "SOME", "WHAT", "WHEN", "WHOM", "BOTH",
      "ITEM", "YEAR", "WEEK", "DATE", "USER", "LAST", "NEXT", "TODAY", "MONTH", "SALE", "CUST",
      "GOOD", "HIGH", "FULL", "REAL", "PART", "ZERO", "MANY", "MORE", "LESS", "FREE", "COST"
    ]);
    if (!stopWords.has(candidate)) {
      return candidate;
    }
  }

  // Pattern 3: Standalone uppercase/alphanumeric code (2 to 5 chars)
  const tokens = trimmed.split(/[\s,]+/);
  for (const t of tokens) {
    const clean = t.replace(/[^a-zA-Z0-9\-]/g, "");
    if (clean.length >= 2 && clean.length <= 5 && /^[A-Za-z0-9]+(-[A-Za-z0-9]+)?$/.test(clean)) {
      const upper = clean.toUpperCase();
      const nonCompanyWords = new Set([
        "ME", "MY", "WE", "US", "TO", "DO", "GO", "NO", "SO", "IF", "OR", "AS", "AT", "BY", "ON", "UP", "IN", "IS", "IT", "OF",
        "AND", "FOR", "THE", "TOP", "ALL", "GET", "SUM", "AVG", "MAX", "MIN", "WHO", "HOW", "WHY", "NOW", "NEW", "OLD",
        "SHOW", "LIST", "VIEW", "FIND", "TELL", "GIVE", "WHAT", "WITH", "FROM", "OVER", "LAST", "PAST", "POST",
        "PO", "GL", "AR", "AP", "AX", "ERP", "DB", "SQL", "RAW", "SET", "ROW", "COL", "DAY", "PER"
      ]);
      if (!nonCompanyWords.has(upper)) {
        return upper;
      }
    }
  }

  return null;
}

/**
 * Detects if the user query is a greeting, help request, or conversational inquiry
 */
function isConversationalInquiry(prompt: string): boolean {
  const p = prompt.trim().toLowerCase();
  const simpleGreetings = new Set([
    "hi", "hello", "hey", "hola", "salam", "assalam", "good morning", "good afternoon",
    "good evening", "how are you", "who are you", "what can you do", "help", "help me",
    "what is this", "what is databridge", "what are your capabilities", "introduce yourself",
    "what agents do you have", "what do you do", "commands", "menu"
  ]);
  if (simpleGreetings.has(p)) return true;
  if (/^(hi|hello|hey|greetings|hola)\b/i.test(p) && p.length < 28) return true;
  if (/\b(who are you|what can you do|what are your capabilities|how can you help|explain your features)\b/i.test(p)) return true;
  return false;
}

/**
 * Creates a welcoming, interactive overview response for conversational queries
 */
function createConversationalResponse(
  availableAgents: Array<{ name: string; description: string; intentKeywords: string; tableScope: string }>
) {
  const agentRows = availableAgents.length > 0
    ? availableAgents.map((a) => `- **${a.name}**: ${a.description} *(Scope: \`${a.tableScope}\`)*`).join("\n")
    : "- **Dynamics AX 2012 Enterprise Swarm**: Sales & Orders, Inventory, General Ledger, Procurement, and Invoicing specialists configured.";

  const conversationalPayload = {
    summary: `### 👋 Welcome to DataBridge AI!

I am your **Autonomous Enterprise Data Intelligence Agent**, engineered to provide instant business answers, deep operational insights, and real-time visualization directly from your databases and live web intelligence.

#### 🤖 Active Domain Agents in Your Swarm:
${agentRows}

---

#### 💡 Try Asking Questions Like:
- 📈 **Sales & Orders:** *"Who are our top 10 customers by total revenue?"*
- 🏢 **Multi-Company / Multi-Tenant:** *"Show me recent sales orders and line amounts for legal entity USMF"*
- 📦 **Inventory & Stock:** *"Which warehouse locations hold the most on-hand physical stock?"*
- 💰 **Financial Ledger:** *"Compare total debits versus credits by account with net movement"*
- 🛒 **Procurement & POs:** *"Who are our top 5 vendors by procurement spend?"*
- 🧾 **Accounts Receivable:** *"List open invoices and unpaid balances by customer"*
- 🌐 **Web Intelligence:** Toggle **Web Search** to correlate internal ERP numbers with live market trends!

*Ask any business question above or type your inquiry to begin.*`,
    recommendedVisualization: "TABLE",
    chartConfig: {
      xAxisKey: "Domain",
      dataKeys: ["Status"],
      title: "DataBridge AI Domain Agent Swarm",
    },
    data: availableAgents.length > 0
      ? availableAgents.map((a) => ({
          Domain: a.name,
          Status: "Active & Ready",
          Scope: a.tableScope,
        }))
      : [
          { Domain: "Sales & Revenue", Status: "Active & Ready", Scope: "SalesTable, SalesLine, CustTable" },
          { Domain: "Inventory & Warehouses", Status: "Active & Ready", Scope: "InventSum, InventDim, InventTable" },
          { Domain: "General Ledger & Journals", Status: "Active & Ready", Scope: "LedgerJournalTable, LedgerJournalTrans" },
          { Domain: "Procurement & Vendors", Status: "Active & Ready", Scope: "PurchTable, PurchLine, VendTable" },
          { Domain: "Accounts Receivable", Status: "Active & Ready", Scope: "CustInvoiceJour, CustInvoiceTrans" },
        ],
  };

  const jsonString = JSON.stringify(conversationalPayload, null, 2);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const chunks = jsonString.match(/.{1,32}/g) || [jsonString];
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
        await new Promise((resolve) => setTimeout(resolve, 6));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-DB-Queried": "false",
      "X-Router-Matched": "true",
    },
  });
}

/**
 * Returns a friendly structured response when Step 1 router fails to match an agent.
 */
function createEmptyScopeFallbackResponse(prompt: string, availableAgents: Array<{ name: string; intentKeywords: string }>) {
  const agentBullets = availableAgents.length > 0
    ? availableAgents.map((a) => `- **${a.name}:** Keywords: \`${a.intentKeywords.split(",").slice(0, 6).join(", ")}...\``).join("\n")
    : "*(No Domain Agents currently created in your organization)*";

  const suggestions: string[] = [];
  for (const a of availableAgents) {
    const lower = a.name.toLowerCase();
    if (lower.includes("sales")) {
      suggestions.push('- *"Who are our top 10 customers by total revenue?"*');
      suggestions.push('- *"Show me recent sales orders and revenue for legal entity USMF"*');
    } else if (lower.includes("invent") || lower.includes("stock")) {
      suggestions.push('- *"Which warehouse locations hold the most on-hand physical stock?"*');
      suggestions.push('- *"Show top 10 items by available physical quantity"*');
    } else if (lower.includes("ledger") || lower.includes("finan")) {
      suggestions.push('- *"Show recent journal entries and voucher amounts"*');
      suggestions.push('- *"Compare total debits versus credits by account"*');
    }
  }

  const suggestionBlock = suggestions.length > 0
    ? `\n\n#### 💡 Try asking questions like:\n${suggestions.join("\n")}`
    : "";

  const fallbackPayload = {
    summary: `### 🧭 Query Scope Assistance\n\nI could not directly match your inquiry: **"${prompt}"** to an active Domain Agent.\n\nTo ensure 100% database precision, incoming questions are routed directly to authorized Domain Agents.${suggestionBlock}\n\n#### Currently Configured Domain Agents:\n${agentBullets}\n\n*Need to query other tables? Create or edit Domain Agents in the [Domain Agent Builder](/dashboard/agents).*`,
    recommendedVisualization: "TABLE",
    chartConfig: {
      xAxisKey: "Agent",
      dataKeys: ["Status"],
      title: "Active Domain Agent Scopes",
    },
    data: availableAgents.map((a) => ({
      Agent: a.name,
      Triggers: a.intentKeywords.split(",").slice(0, 8).join(", "),
      Scope: "Active",
    })),
  };

  const jsonString = JSON.stringify(fallbackPayload, null, 2);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const chunks = jsonString.match(/.{1,32}/g) || [jsonString];
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
        await new Promise((resolve) => setTimeout(resolve, 8));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-DB-Queried": "false",
      "X-Router-Matched": "false",
    },
  });
}

/**
 * Core /api/chat Route Handler:
 * Multi-Agent Semantic Routing Architecture with Swarm Coordination,
 * Dynamic Legal Entity Partitioning, Self-Healing SQL, and Live Web Search.
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
    const enableWebSearch = Boolean(body.enableWebSearch);

    if (!prompt) {
      return NextResponse.json(
        { error: "Missing required parameter: prompt" },
        { status: 400 }
      );
    }

    // Resolve user's organization
    const orgMembership = await prisma.organizationUser.findFirst({
      where: { userId: session.user.id },
      include: { organization: true },
    });

    if (!orgMembership) {
      return NextResponse.json(
        { error: "Forbidden: No organization tenant found for user." },
        { status: 403 }
      );
    }

    const organizationId = orgMembership.orgId;

    // Resolve AI models
    const { routerModel, specialistModel, synthesisModel, providerName, isConfigured } =
      getLanguageModels();

    console.log(`\n================================================================`);
    console.log(`[Multi-Agent Pipeline] 🚀 Incoming Request: "${prompt}"`);
    console.log(`[Multi-Agent Pipeline] Organization: ${orgMembership.organization.name} (${organizationId})`);
    console.log(`[Multi-Agent Pipeline] AI Provider: ${providerName} (Configured: ${isConfigured})`);
    console.log(`================================================================`);

    // =========================================================================
    // STEP 0: Agent Discovery, Filtering, and Auto-Seeding
    // =========================================================================
    const selectedConnIds = (body.connectionIds || []).filter(Boolean);
    if (body.connectionId && !selectedConnIds.includes(body.connectionId)) {
      selectedConnIds.push(body.connectionId);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentDelegate = (prisma as any).agent;
    let agents: AgentRecord[] = await agentDelegate.findMany({
      where: {
        organizationId,
        ...(selectedConnIds.length > 0 ? { connectionId: { in: selectedConnIds } } : {}),
      },
      include: {
        connection: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Fallback: If no agents matched the connection filter, query all org agents
    if (agents.length === 0 && selectedConnIds.length > 0) {
      agents = await agentDelegate.findMany({
        where: { organizationId },
        include: { connection: true },
        orderBy: { createdAt: "desc" },
      });
    }

    // Auto-seed: If the organization has 0 agents, automatically seed from available DB connections
    if (agents.length === 0) {
      const dbConns = await prisma.dbConnection.findMany({
        where: { orgId: organizationId },
        orderBy: { createdAt: "asc" },
      });

      if (dbConns.length > 0) {
        const targetConnId = selectedConnIds[0] || dbConns[0].id;
        console.log(`[Multi-Agent Pipeline] ⚡ Auto-seeding default Domain Agents for connection: ${targetConnId}...`);
        await autoSeedPresetsIfEmpty(organizationId, targetConnId);
        agents = await agentDelegate.findMany({
          where: { organizationId },
          include: { connection: true },
          orderBy: { createdAt: "desc" },
        });
      }

      // If still 0 (e.g. read-only DB permissions), instantiate virtual agent swarm bound to connection
      if (agents.length === 0 && dbConns.length > 0) {
        const primaryConn = dbConns[0];
        agents = DYNAMICS_AX_PRESETS.map((p) => ({
          id: `virtual-${p.id}`,
          organizationId,
          connectionId: primaryConn.id,
          name: p.name,
          description: p.description,
          intentKeywords: p.intentKeywords,
          systemPrompt: p.systemPrompt,
          tableScope: p.tableScope,
          createdAt: new Date(),
          updatedAt: new Date(),
          connection: primaryConn,
        }));
      }
    }

    console.log(`[Multi-Agent Pipeline] Found ${agents.length} configured Domain Agent(s).`);

    // =========================================================================
    // STEP 0.5: Conversational & Greeting Interception
    // =========================================================================
    if (isConversationalInquiry(prompt)) {
      console.log(`[Multi-Agent Pipeline] 👋 Conversational inquiry detected: "${prompt}". Returning overview.`);
      return createConversationalResponse(
        agents.map((a) => ({
          name: a.name,
          description: a.description,
          intentKeywords: a.intentKeywords,
          tableScope: a.tableScope,
        }))
      );
    }

    // =========================================================================
    // STEP 0.8: Live Web Search Intelligence (if requested or enabled)
    // =========================================================================
    let webSourcesList: WebSearchResult[] = [];
    let webIntelligenceText = "";

    const wantsWebSearch = Boolean(enableWebSearch) || /\b(search the web|latest news|competitors?|market trends?|external data|industry news)\b/i.test(prompt);

    if (wantsWebSearch) {
      try {
        const cleanQuery = cleanSearchQuery(prompt);
        console.log(`[Multi-Agent Pipeline] 🌐 Executing Live Web Search: "${cleanQuery}"...`);
        const searchRes = await executeWebSearch(cleanQuery);
        if (searchRes && searchRes.results && searchRes.results.length > 0) {
          webSourcesList = searchRes.results;
          webIntelligenceText = `\n\nLIVE WEB SEARCH INTELLIGENCE (${webSourcesList.length} verified sources):\n${webSourcesList
            .slice(0, 5)
            .map(
              (r, idx) =>
                `- [Source ${idx + 1}: ${r.domain || r.url}] "${r.title}":\n  Snippet: ${r.snippet}${
                  r.content ? `\n  Article Details: ${r.content.slice(0, 400)}...` : ""
                }`
            )
            .join("\n\n")}`;
          console.log(`[Multi-Agent Pipeline] 🌐 Retrieved ${webSourcesList.length} live web sources.`);
        }
      } catch (searchErr) {
        console.warn("[Multi-Agent Pipeline] 🌐 Web search notice:", searchErr);
      }
    }

    // Format multi-turn conversation context for continuity
    const formattedHistoryContext = chatHistory.length > 0
      ? `\n\nRECENT CONVERSATION HISTORY (FOR CONTINUITY & CONTEXT RESOLUTION):\n${chatHistory
          .slice(-4)
          .map((m) => `[${m.role.toUpperCase()}]: ${m.content.slice(0, 300)}`)
          .join("\n")}`
      : "";

    // =========================================================================
    // STEP 1: Strategic Intent Router & Swarm Orchestrator
    // =========================================================================
    console.log(`[Multi-Agent Pipeline] 🧭 Step 1: Evaluating Strategic Intent Router...`);

    let selectedAgents: AgentRecord[] = [];
    let subtaskPlans: SubtaskPlan[] = [];
    let coordinationPlan = "";

    if (agents.length > 0 && isConfigured && (routerModel || specialistModel)) {
      const candidateAgentsList = agents.map((a: AgentRecord) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        intentKeywords: a.intentKeywords,
        tableScope: a.tableScope,
      }));

      const routerSystemPrompt = `You are a strategic Multi-Agent Semantic Router & Orchestrator for an enterprise data intelligence system.
Your purpose is to analyze the user's business question and determine which Domain Agent(s) MUST be invoked.

${formattedHistoryContext}

CORE DOMAIN INTENT RECOGNITION:
1. SALES & ORDERS: Questions regarding sales orders, customers, delivery names, line pricing, sales turnover, revenue, backorders, customer groups, or sales records/entries.
2. INVENTORY & WAREHOUSE: Questions regarding on-hand stock balances, available physical inventory, warehouse sites/locations, batches, inventory valuation, or item catalogs.
3. FINANCIAL LEDGER & BANKING: Questions regarding general ledger journals, vouchers, debits, credits, account balances, chart of accounts, bank accounts, or financial audit records/entries.
4. PROCUREMENT & VENDORS: Questions regarding purchase orders, vendor spend, supplier accounts, purchasing lines, or PO records.
5. ACCOUNTS RECEIVABLE & INVOICING: Questions regarding posted customer invoices, invoice revenue, billing, or receivable ledgers.

DYNAMIC MULTI-TENANCY & LEGAL ENTITY RECOGNITION (DATAAREAID):
- In ERP databases, data is partitioned by [DATAAREAID] (legal entity / company identifier, typically 2 to 5 alphanumeric characters, e.g. USMF, DAT, CONT, CEU, ABC, TGPL, TAJ, T-PB, or ANY other company code).
- When the user asks for transactions, records, entries, summaries, or operations for ANY company code or legal entity:
  * Extract that company code dynamically.
  * Route to the appropriate domain agent with a subtask explicitly specifying that company filter.
  * If the inquiry mentions entries, vouchers, journals, accounting, debits, or credits -> Financial Ledger Agent.
  * If the inquiry mentions sales, orders, revenue, customer accounts, or general operational records -> Sales & Orders Agent.
  * If the inquiry mentions stock, inventory, products, or warehouse locations -> Inventory & Warehouse Agent.
  * If cross-domain analysis is requested, route to multiple agents.

MULTI-AGENT COLLABORATION & SWARM ROUTING:
- SINGLE DOMAIN: If the question strictly pertains to one domain, select that single Domain Agent.
- MULTI-DOMAIN SWARM: If answering requires correlating data across multiple domains (e.g. "Check sales demand vs warehouse availability", "Match sales orders with posted invoices", "Compare purchasing spend against GL bank debits"), you MUST select ALL relevant Domain Agents!
- SUBTASK PRECISION: For each agent, generate an actionable subtaskPrompt specifying:
  * The exact domain dimension to group or filter by (e.g. by item, customer, period, warehouse).
  * The exact numeric metric to calculate (e.g. total revenue, available physical stock, net balance).
  * Any temporal, status, or company/dataAreaId filters present in the question.

AVAILABLE DOMAIN AGENTS:
${candidateAgentsList.map((a) => `- Agent ID: "${a.id}"\n  Name: "${a.name}"\n  Keywords: [${a.intentKeywords}]\n  Description: "${a.description}"\n  Table Scope: [${a.tableScope}]`).join("\n\n")}

CRITICAL RESPONSE FORMAT:
Return ONLY a strict JSON object:
{
  "selectedAgentIds": ["agent-id-or-name-1", "agent-id-or-name-2"],
  "coordinationPlan": "Why these agents collaborate and how their data will be synthesized",
  "subtasks": [
    { "agentId": "agent-id-or-name-1", "subtaskPrompt": "Precise instruction for agent 1 including specific metric, dimension, and filters", "reason": "Reason for agent 1" }
  ]
}
If no agent matches, return:
{ "selectedAgentIds": [], "coordinationPlan": null, "subtasks": [] }`;

      try {
        const activeRouterModel = (routerModel || specialistModel)!;
        const routerRes = await generateText({
          model: activeRouterModel as Parameters<typeof generateText>[0]["model"],
          system: routerSystemPrompt,
          prompt: `User Question: "${prompt}"\nDetermine which Domain Agent(s) to invoke. Return ONLY JSON.`,
        });

        const rawRouterText = routerRes.text.trim();
        console.log(`[Multi-Agent Pipeline] 🧭 Router Output: ${rawRouterText}`);

        const jsonCleaned = rawRouterText.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
        const firstBrace = jsonCleaned.indexOf("{");
        const lastBrace = jsonCleaned.lastIndexOf("}");

        if (firstBrace !== -1 && lastBrace !== -1) {
          const parsed = JSON.parse(jsonCleaned.substring(firstBrace, lastBrace + 1));

          const rawMatches: string[] = Array.isArray(parsed.selectedAgentIds)
            ? parsed.selectedAgentIds
            : parsed.selectedAgentId
            ? [parsed.selectedAgentId]
            : [];

          const resolvedAgentIds = new Set<string>();

          for (const rawId of rawMatches) {
            const rawStr = String(rawId).trim().toLowerCase();
            for (const ag of agents) {
              const agNameLower = ag.name.toLowerCase();
              const agIdLower = ag.id.toLowerCase();
              if (
                agIdLower === rawStr ||
                agNameLower === rawStr ||
                agNameLower.includes(rawStr) ||
                rawStr.includes(agNameLower) ||
                (rawStr.includes("sales") && agNameLower.includes("sales")) ||
                (rawStr.includes("invent") && agNameLower.includes("invent")) ||
                (rawStr.includes("ledger") && (agNameLower.includes("ledger") || agNameLower.includes("finan"))) ||
                (rawStr.includes("purch") && agNameLower.includes("purch")) ||
                (rawStr.includes("invoice") && agNameLower.includes("invoic"))
              ) {
                resolvedAgentIds.add(ag.id);
              }
            }
          }

          selectedAgents = agents.filter((a: AgentRecord) => resolvedAgentIds.has(a.id));
          coordinationPlan = parsed.coordinationPlan || "";

          if (Array.isArray(parsed.subtasks)) {
            subtaskPlans = parsed.subtasks.map((st: { agentId?: string; subtaskPrompt?: string; reason?: string }) => {
              const stIdLower = String(st.agentId || "").trim().toLowerCase();
              const matched = agents.find((a) =>
                a.id.toLowerCase() === stIdLower ||
                a.name.toLowerCase() === stIdLower ||
                a.name.toLowerCase().includes(stIdLower) ||
                stIdLower.includes(a.name.toLowerCase()) ||
                (stIdLower.includes("sales") && a.name.toLowerCase().includes("sales")) ||
                (stIdLower.includes("invent") && a.name.toLowerCase().includes("invent")) ||
                (stIdLower.includes("ledger") && (a.name.toLowerCase().includes("ledger") || a.name.toLowerCase().includes("finan"))) ||
                (stIdLower.includes("purch") && a.name.toLowerCase().includes("purch")) ||
                (stIdLower.includes("invoice") && a.name.toLowerCase().includes("invoic"))
              );
              return {
                agentId: matched ? matched.id : String(st.agentId || ""),
                subtaskPrompt: String(st.subtaskPrompt || prompt),
                reason: st.reason,
              };
            });
          }
        }
      } catch (routerErr) {
        console.warn("[Multi-Agent Pipeline] ⚠️ Router LLM parsing notice:", routerErr);
      }
    }

    // Heuristic Fallback Router (Keyword & Dynamic Entity match if LLM router was inconclusive or returned 0 agents)
    if (selectedAgents.length === 0 && agents.length > 0) {
      const lowerPrompt = prompt.toLowerCase();
      const scoredAgents: { agent: AgentRecord; score: number }[] = [];

      for (const ag of agents) {
        let score = 0;
        const keywords = ag.intentKeywords.toLowerCase().split(",").map((k: string) => k.trim());
        for (const kw of keywords) {
          if (kw && lowerPrompt.includes(kw)) score += 5;
        }
        if (lowerPrompt.includes(ag.name.toLowerCase())) score += 10;
        if (score > 0) {
          scoredAgents.push({ agent: ag, score });
        }
      }

      scoredAgents.sort((a, b) => b.score - a.score);

      if (scoredAgents.length > 0) {
        selectedAgents.push(scoredAgents[0].agent);
        if (scoredAgents.length > 1 && scoredAgents[1].score >= 5) {
          selectedAgents.push(scoredAgents[1].agent);
        }
        console.log(`[Multi-Agent Pipeline] 🧭 Heuristic keyword routing selected ${selectedAgents.length} agent(s): ${selectedAgents.map(a => a.name).join(", ")}`);
      } else {
        // Universal Multi-Tenant Entity & General Record Fallback:
        const dynamicEntityCode = extractDynamicEntityCode(prompt);
        const isGeneralRecordInquiry = /\b(records?|entires?|entries|transactions?|data|activity|overview|all|dump|summary|show|list)\b/i.test(lowerPrompt);

        if (dynamicEntityCode || isGeneralRecordInquiry) {
          const entityCode = dynamicEntityCode || "";
          const salesAgent = agents.find((a) => a.name.toLowerCase().includes("sales") || a.tableScope.toLowerCase().includes("salestable"));
          const ledgerAgent = agents.find((a) => a.name.toLowerCase().includes("ledger") || a.name.toLowerCase().includes("finan") || a.tableScope.toLowerCase().includes("ledgerjournal"));
          const inventoryAgent = agents.find((a) => a.name.toLowerCase().includes("invent") || a.name.toLowerCase().includes("stock") || a.tableScope.toLowerCase().includes("inventsum"));

          let primaryFallback: AgentRecord | undefined;
          if (/\b(entir|entr|journal|voucher|ledger|gl|debit|credit|account|bank)\b/i.test(lowerPrompt) && ledgerAgent) {
            primaryFallback = ledgerAgent;
          } else if (/\b(item|stock|warehous|product|invent|batch|qty)\b/i.test(lowerPrompt) && inventoryAgent) {
            primaryFallback = inventoryAgent;
          } else if (salesAgent) {
            primaryFallback = salesAgent;
          } else if (ledgerAgent) {
            primaryFallback = ledgerAgent;
          } else if (inventoryAgent) {
            primaryFallback = inventoryAgent;
          } else {
            primaryFallback = agents[0];
          }

          if (primaryFallback) {
            selectedAgents.push(primaryFallback);
            let subtaskPrompt = "";
            const isSales = primaryFallback.name.toLowerCase().includes("sales") || primaryFallback.tableScope.toLowerCase().includes("salestable");
            const isLedger = primaryFallback.name.toLowerCase().includes("ledger") || primaryFallback.name.toLowerCase().includes("finan");
            const isInvent = primaryFallback.name.toLowerCase().includes("invent") || primaryFallback.tableScope.toLowerCase().includes("inventsum");

            if (isSales) {
              subtaskPrompt = entityCode
                ? `Retrieve recent sales order records, customer accounts, and order line revenue for legal entity '${entityCode}'`
                : `Retrieve recent customer sales orders and transaction records matching: "${prompt}"`;
            } else if (isLedger) {
              subtaskPrompt = entityCode
                ? `Retrieve recent General Ledger journal entries, vouchers, debit/credit records, and descriptions for legal entity '${entityCode}'`
                : `Retrieve recent General Ledger transactions, vouchers, and accounting records matching: "${prompt}"`;
            } else if (isInvent) {
              subtaskPrompt = entityCode
                ? `Retrieve on-hand stock records, items, and warehouse inventory balances for legal entity '${entityCode}'`
                : `Retrieve inventory item catalog and on-hand stock records matching: "${prompt}"`;
            } else {
              subtaskPrompt = entityCode
                ? `Retrieve recent operational records and transactions for legal entity '${entityCode}'`
                : `Retrieve relevant enterprise records matching: "${prompt}"`;
            }

            subtaskPlans.push({
              agentId: primaryFallback.id,
              subtaskPrompt,
              reason: entityCode ? `General record inquiry for legal entity ${entityCode}` : "Broad enterprise record inquiry",
            });
            console.log(`[Multi-Agent Pipeline] 🧭 Dynamic Entity fallback routed to "${primaryFallback.name}" (Entity: ${entityCode || "All"})`);
          }
        }
      }
    }

    // Ensure every selected agent has an explicit subtask
    for (const ag of selectedAgents) {
      if (!subtaskPlans.some((s) => s.agentId === ag.id)) {
        const dynamicEntityCode = extractDynamicEntityCode(prompt);
        subtaskPlans.push({
          agentId: ag.id,
          subtaskPrompt: dynamicEntityCode
            ? `${prompt} (Filter for legal entity / company '${dynamicEntityCode}')`
            : prompt,
          reason: `Auto-assigned based on domain scope: ${ag.tableScope}`,
        });
      }
    }

    // If still no agent matches:
    if (selectedAgents.length === 0) {
      console.log(`[Multi-Agent Pipeline] ⚠️ Step 1 Router found no matching agent. Triggering Empty Scope Fallback.`);
      return createEmptyScopeFallbackResponse(
        prompt,
        agents.map((a: AgentRecord) => ({ name: a.name, intentKeywords: a.intentKeywords }))
      );
    }

    console.log(`[Multi-Agent Pipeline] ✅ Step 1 Selected ${selectedAgents.length} Agent(s):`);
    selectedAgents.forEach((a, idx) => {
      console.log(`   [Agent ${idx + 1}] "${a.name}" [ID: ${a.id}] | Tables: [${a.tableScope}]`);
    });

    // =========================================================================
    // STEP 2: Multi-Agent Scoped Execution & Self-Healing Query Engine
    // =========================================================================
    console.log(`[Multi-Agent Pipeline] ⚡ Step 2: Executing ${selectedAgents.length} Domain Specialist(s)...`);

    const executedAgents: ExecutedAgentOutput[] = [];
    const poolCache = new Map<string, sql.ConnectionPool>();

    try {
      for (let i = 0; i < selectedAgents.length; i++) {
        const agent = selectedAgents[i];
        const targetConn = agent.connection;

        if (!targetConn) {
          console.warn(`[Multi-Agent Pipeline] Target connection missing for agent: ${agent.name}`);
          continue;
        }

        const subtask = subtaskPlans.find((s) => s.agentId === agent.id);
        const agentPrompt = subtask?.subtaskPrompt || prompt;
        const dbEngine = (targetConn.dbType || "mssql").toLowerCase();

        // Inter-Agent Context: Pass data from previous agents to current agent
        const interAgentContext = executedAgents.length > 0
          ? `\n\nINTER-AGENT COLLABORATION CONTEXT:\nPrevious Domain Agent(s) executed:\n${executedAgents
              .map(
                (ea) =>
                  `- [Agent: ${ea.agent.name}] retrieved ${ea.totalRowsCount} records using query:\n\`\`\`sql\n${ea.rawExecutedQuery}\n\`\`\`\nSample Results (First 3 records):\n${JSON.stringify(
                    ea.rawResults.slice(0, 3)
                  )}`
              )
              .join("\n")}\nYou can use key identifiers (e.g. item numbers, customer accounts) from previous agents to filter or target your domain queries.`
          : "";

        const tableNamesList = agent.tableScope
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);

        // Decrypt credentials safely
        let plainPassword = "";
        try {
          plainPassword = decryptPassword(targetConn.encryptedPassword);
        } catch (decErr) {
          console.warn(`[Multi-Agent Pipeline] ⚠️ Could not decrypt password for connection ${targetConn.id}:`, decErr);
        }

        // Initialize MSSQL connection pool if needed
        let pool = poolCache.get(targetConn.id) || null;
        if (!pool && plainPassword && dbEngine === "mssql") {
          const mssqlConfig: sql.config = {
            server: targetConn.host,
            port: Number(targetConn.port) || 1433,
            database: targetConn.dbName,
            user: targetConn.username,
            password: plainPassword,
            connectionTimeout: 15000,
            requestTimeout: 60000,
            pool: { max: 2, min: 0, idleTimeoutMillis: 3000 },
          };

          try {
            pool = new sql.ConnectionPool({
              ...mssqlConfig,
              options: { encrypt: true, trustServerCertificate: true },
            });
            await pool.connect();
            poolCache.set(targetConn.id, pool);
          } catch (encErr) {
            console.warn("[Multi-Agent Pipeline] Encrypted handshake retry for pool:", encErr);
            try {
              pool = new sql.ConnectionPool({
                ...mssqlConfig,
                options: { encrypt: false, trustServerCertificate: true },
              });
              await pool.connect();
              poolCache.set(targetConn.id, pool);
            } catch (plainConnErr) {
              console.warn(`[Multi-Agent Pipeline] ⚠️ Could not connect to database for agent "${agent.name}":`, plainConnErr);
              pool = null;
            }
          }
        }

        // Query schema for this agent's scoped tables
        const scopedSchemaContext = dbEngine === "mssql"
          ? await fetchScopedSchemaMSSQL(pool, tableNamesList, targetConn.schemaContext)
          : targetConn.schemaContext || `Tables in scope: ${agent.tableScope}`;

        // Build specialist system prompt
        const specialistSystemPrompt = `${agent.systemPrompt}

TARGET ENGINE: ${dbEngine.toUpperCase()} (Dialect: ${dbEngine === "mssql" ? "T-SQL for Dynamics AX" : dbEngine})

STRICT SCHEMA & ENTERPRISE PERFORMANCE MANDATES:
1. ONLY USE COLUMNS LISTED IN THE SCOPED SCHEMA BELOW.
   NEVER invent, guess, or assume column names! If a column is not listed, find the real column in the schema below.

2. CORE ENTERPRISE SCHEMA RULES:
   [SALES & REVENUE DOMAIN]:
   - [SalesTable] (st): Customer name is in st.[DELIVERYNAME] or st.[SALESNAME]. (NO "CustomerName" column).
   - [SalesLine] (sl): Line revenue is sl.[LINEAMOUNT]. Quantity is sl.[SALESQTY]. Price is sl.[SALESPRICE]. Description is sl.[NAME].
   - Join: FROM dbo.[SalesTable] st WITH (NOLOCK) INNER JOIN dbo.[SalesLine] sl WITH (NOLOCK) ON st.[SALESID] = sl.[SALESID] AND st.[DATAAREAID] = sl.[DATAAREAID]
   - Total Revenue: ISNULL(SUM(sl.[LINEAMOUNT]), 0)
   - Exclude canceled orders: sl.[SALESSTATUS] <> 4 AND st.[SALESSTATUS] <> 4

   [INVENTORY & WAREHOUSE DOMAIN]:
   - [InventSum] (isum) is AUTHORITATIVE for current on-hand stock! Available physical stock is isum.[AVAILPHYSICAL].
   - NEVER query [InventTrans] for current stock. Always use [InventSum].
   - Active stock filter: isum.[CLOSED] = 0.
   - Join [InventDim] (idim): ON isum.[INVENTDIMID] = idim.[INVENTDIMID] AND isum.[DATAAREAID] = idim.[DATAAREAID] for warehouse (idim.[INVENTLOCATIONID]).

   [GENERAL LEDGER & BANKING DOMAIN]:
   - [LedgerJournalTable] (ljt_h) & [LedgerJournalTrans] (ljt).
   - Voucher: ljt.[VOUCHER], Date: ljt.[TRANSDATE], Account: ljt.[ACCOUNTNUM].
   - Debits: ljt.[AMOUNTCURDEBIT], Credits: ljt.[AMOUNTCURCREDIT], Net: (ljt.[AMOUNTCURDEBIT] - ljt.[AMOUNTCURCREDIT]).
   - Join on JournalNum AND DataAreaId.

   [PROCUREMENT & VENDOR DOMAIN]:
   - [PurchTable] (pt) & [PurchLine] (pl).
   - Vendor Name: pt.[PURCHNAME]. Line spend: pl.[LINEAMOUNT]. Quantity: pl.[PURCHQTY].
   - Join on PurchId AND DataAreaId.

   [ACCOUNTS RECEIVABLE & INVOICING DOMAIN]:
   - [CustInvoiceJour] (cij) & [CustInvoiceTrans] (cit).
   - Invoice Amount: cij.[INVOICEAMOUNT]. Line Revenue: cit.[LINEAMOUNT].
   - Join on InvoiceId, InvoiceDate, and DataAreaId.

3. DYNAMIC MULTI-TENANCY & ANY COMPANY / LEGAL ENTITY (DATAAREAID):
   - All tables partition data by [DATAAREAID].
   - When the user's prompt or subtask specifies ANY company or legal entity:
     Filter dynamically: (table.[DATAAREAID] = '<COMPANY_CODE>' OR LOWER(table.[DATAAREAID]) = LOWER('<COMPANY_CODE>'))
   - When NO company is specified: Query across all legal entities.
   - When comparing companies: Group by table.[DATAAREAID] AS [Legal Entity].

4. VISUALIZATION DIRECTIVES:
   - Column 1: Primary dimension / category (e.g. [Customer], [Item], [Warehouse], [Period], [Account Number]).
   - Aggregate metrics: Clean aliases with ISNULL(SUM(...), 0) (e.g. [Total Revenue], [Available Stock], [Total Debits]).
   - GROUP BY: Every non-aggregated column in SELECT must be in GROUP BY.
   - Return strictly read-only query starting with SELECT or WITH.
${interAgentContext}

=======================================================
HEAVILY PRUNED DOMAIN SCHEMA (PERMITTED TABLES ONLY):
=======================================================
${scopedSchemaContext}`;

        let candidateSQL = "";

        if (isConfigured && specialistModel) {
          const sqlRes = await generateText({
            model: specialistModel as Parameters<typeof generateText>[0]["model"],
            system: specialistSystemPrompt,
            prompt: `User Request: "${agentPrompt}"\nGenerate the exact read-only query for these scoped tables. Compute accurate results across the dataset.`,
          });

          candidateSQL = cleanQueryString(sqlRes.text);
        } else {
          const firstTable = cleanTableName(tableNamesList[0] || "SalesTable");
          candidateSQL = `SELECT TOP (100) * FROM dbo.[${firstTable}];`;
        }

        console.log(`[Multi-Agent Pipeline] 📝 [${agent.name}] Generated SQL:\n   ${candidateSQL}`);

        // Phase 4 Security: Enforce strict regex validation
        let validation = validateSafeReadOnlyMSSQLQuery(candidateSQL);
        if (!validation.isSafe) {
          console.warn(`[Multi-Agent Pipeline] ⚠️ Security notice for ${agent.name}: ${validation.reason}`);
          if (isConfigured && specialistModel) {
            try {
              const healSecRes = await generateText({
                model: specialistModel as Parameters<typeof generateText>[0]["model"],
                system: specialistSystemPrompt,
                prompt: `Your previous SQL query failed security validation: "${validation.reason}".
Offending query:
${candidateSQL}

Instructions:
Generate a strictly single, read-only SELECT or WITH statement without semicolons or mutation keywords. Return ONLY the raw SQL query.`,
              });
              const healedSecSQL = cleanQueryString(healSecRes.text);
              const retryVal = validateSafeReadOnlyMSSQLQuery(healedSecSQL);
              if (retryVal.isSafe) {
                candidateSQL = healedSecSQL;
                validation = retryVal;
              }
            } catch (secHealErr) {
              console.warn("[Multi-Agent Pipeline] Security self-healing error:", secHealErr);
            }
          }
        }

        let rawResults: unknown[] = [];
        let queryExecutionError: string | null = null;
        let executedQuery = candidateSQL;

        if (!validation.isSafe) {
          console.error(`[Multi-Agent Pipeline] 🛑 Security Violation persists for ${agent.name}: ${validation.reason}`);
          queryExecutionError = `Security validation notice: ${validation.reason}`;
        } else if (dbEngine === "mssql" && !pool) {
          queryExecutionError = "Database connection offline or unreachable.";
        } else {
          // Execute query with multi-engine support & Self-Healing Auto-Correction
          const tStart = Date.now();
          try {
            if (dbEngine === "mssql" && pool) {
              const queryResponse = await pool.request().query(candidateSQL);
              rawResults = queryResponse.recordset || [];
            } else {
              rawResults = await executeRawQueryOnConnection(
                {
                  id: targetConn.id,
                  name: targetConn.name,
                  dbType: targetConn.dbType,
                  host: targetConn.host,
                  port: targetConn.port,
                  dbName: targetConn.dbName,
                  username: targetConn.username,
                  encryptedPassword: targetConn.encryptedPassword,
                  schemaContext: targetConn.schemaContext,
                },
                candidateSQL
              );
            }
            console.log(`[Multi-Agent Pipeline] ✅ [${agent.name}] Query executed in ${Date.now() - tStart}ms. Retrieved ${rawResults.length} row(s).`);
          } catch (firstErr: unknown) {
            const firstErrMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
            console.warn(`[Multi-Agent Pipeline] ⚠️ [${agent.name}] Query notice: ${firstErrMsg}`);

            const isConnectionError =
              firstErrMsg.includes("ECONNREFUSED") ||
              firstErrMsg.includes("timeout") ||
              firstErrMsg.includes("Connection lost") ||
              firstErrMsg.includes("Failed to connect") ||
              firstErrMsg.includes("ETIMEDOUT");

            if (isConfigured && specialistModel && !isConnectionError) {
              console.log(`[Multi-Agent Pipeline] 🩺 [${agent.name}] Self-Healing: Attempting query auto-correction...`);
              try {
                const repairPrompt = `Your previous query generated an execution error:
"${firstErrMsg}"

OFFENDING SQL QUERY:
${candidateSQL}

VERIFIED ACCURATE TABLE & COLUMN SCHEMA:
${scopedSchemaContext}

CORRECTION INSTRUCTIONS:
1. Fix the error by strictly using only the valid columns and tables shown in the schema above.
2. GROUP BY RULE: If using aggregate functions (SUM, COUNT, AVG), every non-aggregated column in the SELECT list MUST appear in the GROUP BY clause.
3. TABLE QUALIFICATION: Prefix every column with its table alias.
4. TABLE HINT: Always include WITH (NOLOCK) on each table in FROM and JOIN clauses for MSSQL.
5. Return ONLY the corrected read-only query starting with SELECT or WITH. No conversational prose, no markdown code fences.`;

                const healRes = await generateText({
                  model: specialistModel as Parameters<typeof generateText>[0]["model"],
                  system: specialistSystemPrompt,
                  prompt: repairPrompt,
                });

                const healedSQL = cleanQueryString(healRes.text);
                const healedValidation = validateSafeReadOnlyMSSQLQuery(healedSQL);
                if (healedValidation.isSafe) {
                  console.log(`[Multi-Agent Pipeline] 🩺 [${agent.name}] Retrying with healed query:\n   ${healedSQL}`);
                  if (dbEngine === "mssql" && pool) {
                    const retryResponse = await pool.request().query(healedSQL);
                    rawResults = retryResponse.recordset || [];
                  } else {
                    rawResults = await executeRawQueryOnConnection(
                      {
                        id: targetConn.id,
                        name: targetConn.name,
                        dbType: targetConn.dbType,
                        host: targetConn.host,
                        port: targetConn.port,
                        dbName: targetConn.dbName,
                        username: targetConn.username,
                        encryptedPassword: targetConn.encryptedPassword,
                        schemaContext: targetConn.schemaContext,
                      },
                      healedSQL
                    );
                  }
                  executedQuery = healedSQL;
                  queryExecutionError = null;
                  console.log(`[Multi-Agent Pipeline] 🩺 [${agent.name}] Self-healing SUCCESS! Retrieved ${rawResults.length} row(s).`);
                } else {
                  queryExecutionError = firstErrMsg;
                }
              } catch (healErr) {
                console.warn(`[Multi-Agent Pipeline] [${agent.name}] Self-healing retry error:`, healErr);
                queryExecutionError = firstErrMsg;
              }
            } else {
              queryExecutionError = firstErrMsg;
            }
          }
        }

        executedAgents.push({
          agent,
          subtaskPrompt: agentPrompt,
          scopedSchemaContext,
          rawExecutedQuery: executedQuery,
          rawResults,
          totalRowsCount: rawResults.length,
          queryExecutionError,
        });
      }
    } finally {
      // Close all connection pools
      for (const p of poolCache.values()) {
        try { await p.close(); } catch {}
      }
    }

    // =========================================================================
    // STEP 3: Synthesis & Executive Multi-Agent Dashboard Formatting
    // =========================================================================
    console.log(`[Multi-Agent Pipeline] 📊 Step 3: Synthesis & Dashboard Formatting...`);

    const primaryAgent = executedAgents[0]?.agent || selectedAgents[0];
    const primaryConn = primaryAgent?.connection || {
      id: "conn-default",
      name: "Default Connection",
      dbType: "MSSQL",
      host: "localhost",
      port: 1433,
      dbName: "DynamicsAX",
      username: "sa",
      encryptedPassword: "",
    };
    const isMultiAgent = executedAgents.length > 1;

    const combinedAgentNames = executedAgents.map((ea) => ea.agent.name).join(" + ") + (isMultiAgent ? " (Multi-Agent Swarm)" : "");
    const combinedRawQuery = executedAgents
      .map(
        (ea) =>
          `-- ========================================================\n-- Domain Agent: ${ea.agent.name}\n-- Scope: ${ea.agent.tableScope}\n-- Prompt: ${ea.subtaskPrompt}\n-- ========================================================\n${ea.rawExecutedQuery}`
      )
      .join("\n\n");

    const totalVerifiedRecords = executedAgents.reduce((sum, ea) => sum + ea.totalRowsCount, 0);

    // Merge or select primary dataset for Recharts rendering
    const MAX_SYNTHESIS_ROWS = 100;
    const primaryDataset = (executedAgents[0]?.rawResults || []).slice(0, MAX_SYNTHESIS_ROWS);

    const firstRow = (primaryDataset[0] as Record<string, unknown>) || {};
    const rowKeys = Object.keys(firstRow).filter((k) => k !== "id" && k !== "_id" && k !== "RECID");
    const primaryXKey = rowKeys[0] || "Category";
    const numericKeys = rowKeys.filter((k) => {
      const val = firstRow[k];
      return typeof val === "number" || (!isNaN(Number(val)) && val !== null && val !== "");
    });

    const fallbackWidget = {
      summary: executedAgents.some((ea) => ea.queryExecutionError)
        ? `### ⚠️ Query Execution Notice\n\nDomain Agent notice encountered while querying database:\n\`\`\`\n${executedAgents.map(ea => ea.queryExecutionError ? `[${ea.agent.name}]: ${ea.queryExecutionError}` : "").filter(Boolean).join("\n")}\n\`\`\``
        : `### 📊 Executive Summary (${combinedAgentNames})\n\nProcessed **${totalVerifiedRecords} verified records** across **${executedAgents.length} Domain Agent(s)** for "${prompt}".\n\n${coordinationPlan ? `#### Coordination Plan:\n${coordinationPlan}\n\n` : ""}#### Agent Execution Details:\n${executedAgents.map(ea => `- **${ea.agent.name}**: Retrieved ${ea.totalRowsCount} records from \`${ea.agent.tableScope}\`.`).join("\n")}`,
      recommendedVisualization: (numericKeys.length > 0 && totalVerifiedRecords > 1 ? "BAR" : "TABLE") as "BAR" | "TABLE",
      chartConfig: {
        xAxisKey: primaryXKey,
        dataKeys: numericKeys.slice(0, 2),
        title: `${combinedAgentNames}: ${prompt.slice(0, 40)}`,
      },
      data: primaryDataset,
      webSources: webSourcesList.length > 0 ? webSourcesList : undefined,
      isWebSearch: webSourcesList.length > 0,
      agentId: selectedAgents.map(a => a.id).join(","),
      agentName: combinedAgentNames,
      rawQuery: combinedRawQuery,
    };

    if (isConfigured && synthesisModel) {
      const encoder = new TextEncoder();
      const multiAgentContext = executedAgents
        .map(
          (ea, idx) => `### AGENT ${idx + 1}: "${ea.agent.name}"
Domain Scope: [${ea.agent.tableScope}]
Subtask: "${ea.subtaskPrompt}"
Executed Query:
\`\`\`sql
${ea.rawExecutedQuery}
\`\`\`
Total Records Retrieved: ${ea.totalRowsCount}
${ea.queryExecutionError ? `Execution Notice: ${ea.queryExecutionError}` : ""}
Data Sample (Up to ${MAX_SYNTHESIS_ROWS} rows):
${JSON.stringify(ea.rawResults.slice(0, MAX_SYNTHESIS_ROWS), null, 2)}`
        )
        .join("\n\n----------------------------------------\n\n");

      const synthesisStream = streamText({
        model: synthesisModel as Parameters<typeof streamText>[0]["model"],
        maxRetries: 1,
        system: `You are an executive business intelligence synthesizer formatting verified data from enterprise systems and live web intelligence.

COLLABORATING AGENTS INVOLVED: ${combinedAgentNames}
${coordinationPlan ? `COORDINATION PLAN: ${coordinationPlan}` : ""}
${webIntelligenceText}
${formattedHistoryContext}

MANDATORY RESPONSE FORMAT (STRICT JSON SCHEMA):
You MUST formulate your response as a valid, well-formed JSON object matching this exact schema:
{
  "summary": "Full markdown response with executive insights, key findings, cross-agent correlations, and strategic takeaways. Attribute which agent retrieved which data. If live web search was used, cite sources inline like [Source 1: domain.com].",
  "recommendedVisualization": "BAR" | "LINE" | "PIE" | "TABLE" | "AREA",
  "chartConfig": {
    "xAxisKey": "string (name of the primary dimension or category column for Recharts)",
    "dataKeys": ["string (one or more numeric metric column names to plot in Recharts)"],
    "title": "string (concise chart title)"
  },
  "data": [
    /* Array of row objects for Recharts rendering (use primary or merged cross-agent dataset). Ensure numeric metrics are numbers, not formatted currency strings. */
  ],
  "webSources": [
    /* Include web sources array if web intelligence was provided */
  ]
}

VISUALIZATION RULES:
- Use "BAR" when comparing amounts, quantities, or sales across customers, items, or categories.
- Use "LINE" for dates or chronological trends.
- Use "PIE" for proportion of totals (under 7 slices).
- Use "TABLE" for listings or text-heavy datasets.
- Return ONLY the strict JSON object. No conversational chat outside the JSON.`,
        messages: [
          {
            role: "user",
            content: prompt,
          },
          {
            role: "assistant",
            content: `VERIFIED MULTI-AGENT ERP DATASETS:\n\n${multiAgentContext}`,
          },
          {
            role: "user",
            content: `Please synthesize the executive summary across all collaborating agents and output the strict JSON with "summary", "recommendedVisualization", "chartConfig", "data", and "webSources" for Recharts dashboard rendering.`,
          },
        ],
      });

      const resilientStream = new ReadableStream({
        async start(controller) {
          let chunksEmitted = 0;
          try {
            for await (const textChunk of synthesisStream.textStream) {
              controller.enqueue(encoder.encode(textChunk));
              chunksEmitted++;
            }

            if (chunksEmitted === 0) {
              const fallbackStr = JSON.stringify(fallbackWidget, null, 2);
              const chunks = fallbackStr.match(/.{1,48}/g) || [fallbackStr];
              for (const c of chunks) {
                controller.enqueue(encoder.encode(c));
                await new Promise((r) => setTimeout(r, 6));
              }
            }
          } catch (err) {
            console.warn("[Multi-Agent Pipeline] Stream handling fallback:", err);
            const fallbackStr = JSON.stringify(fallbackWidget, null, 2);
            controller.enqueue(encoder.encode(fallbackStr));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(resilientStream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
          "X-Selected-Agent": encodeURIComponent(combinedAgentNames),
          "X-Agent-Id": selectedAgents.map((a) => a.id).join(","),
          "X-Connection-Id": primaryConn.id,
          "X-Raw-Query": encodeURIComponent(combinedRawQuery),
          "X-DB-Queried": String(executedAgents.some(ea => ea.totalRowsCount > 0)),
          "X-Router-Matched": "true",
          "X-Multi-Agent": String(isMultiAgent),
          "X-Web-Search": String(webSourcesList.length > 0),
        },
      });
    }

    // Autonomous Fallback (when no LLM is configured)
    const jsonString = JSON.stringify(fallbackWidget, null, 2);
    const encoder = new TextEncoder();
    const customStream = new ReadableStream({
      async start(controller) {
        const chunks = jsonString.match(/.{1,32}/g) || [jsonString];
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
          await new Promise((resolve) => setTimeout(resolve, 8));
        }
        controller.close();
      },
    });

    return new Response(customStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Selected-Agent": encodeURIComponent(combinedAgentNames),
        "X-Agent-Id": selectedAgents.map((a) => a.id).join(","),
        "X-Connection-Id": primaryConn.id,
        "X-Raw-Query": encodeURIComponent(combinedRawQuery),
        "X-DB-Queried": String(executedAgents.some(ea => ea.totalRowsCount > 0)),
        "X-Router-Matched": "true",
        "X-Multi-Agent": String(isMultiAgent),
        "X-Web-Search": String(webSourcesList.length > 0),
      },
    });

  } catch (error) {
    console.error("[Multi-Agent Pipeline] Critical error in /api/chat:", error);
    return NextResponse.json(
      {
        error: "Internal Server Error in Multi-Agent Pipeline",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
