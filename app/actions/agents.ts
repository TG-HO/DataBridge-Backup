"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decryptPassword } from "@/lib/crypto";
import { revalidatePath } from "next/cache";
import sql from "mssql";

import {
  AgentData,
  CreateAgentInput,
  UpdateAgentInput,
  ServerActionResponse,
  AgentEntity,
  DYNAMICS_AX_PRESETS,
} from "@/lib/agent-presets";

export type { AgentData, CreateAgentInput, UpdateAgentInput, ServerActionResponse, AgentEntity };

// Resilient accessor for Prisma Agent delegate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agentDb = (prisma as any).agent;

/**
 * Auto-seeds default Dynamics AX domain agent presets for an organization
 * if the organization has at least one active database connection and 0 agents.
 */
export async function autoSeedPresetsIfEmpty(orgId: string, targetConnectionId?: string): Promise<boolean> {
  try {
    const existingCount = await agentDb.count({
      where: { organizationId: orgId },
    });

    if (existingCount > 0) return false;

    // Find target connection
    const targetConn = targetConnectionId
      ? await prisma.dbConnection.findFirst({ where: { id: targetConnectionId, orgId } })
      : await prisma.dbConnection.findFirst({ where: { orgId }, orderBy: { createdAt: "asc" } });

    if (!targetConn) return false;

    console.log(`[Agents] Auto-seeding 5 Domain Agents for org ${orgId} using connection ${targetConn.name} (${targetConn.id})...`);

    for (const preset of DYNAMICS_AX_PRESETS) {
      await agentDb.create({
        data: {
          organizationId: orgId,
          connectionId: targetConn.id,
          name: preset.name,
          description: preset.description,
          intentKeywords: preset.intentKeywords,
          systemPrompt: preset.systemPrompt,
          tableScope: preset.tableScope,
        },
      });
    }

    console.log(`[Agents] Successfully auto-seeded 5 Domain Agents for organization ${orgId}.`);
    return true;
  } catch (seedErr) {
    console.warn("[Agents] Notice during auto-seeding:", seedErr);
    return false;
  }
}

/**
 * Fetch all Domain Agents for the user's organization
 */
export async function getAgents(orgIdParam?: string): Promise<ServerActionResponse<AgentData[]>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized: Active session required." };
    }

    const membership = await prisma.organizationUser.findFirst({
      where: {
        userId: session.user.id,
        ...(orgIdParam ? { orgId: orgIdParam } : {}),
      },
    });

    if (!membership) {
      return { success: false, error: "No organization membership found for this user." };
    }

    let agents: AgentEntity[] = await agentDb.findMany({
      where: { organizationId: membership.orgId },
      include: {
        connection: {
          select: {
            id: true,
            name: true,
            dbType: true,
            dbName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // If no agents exist, auto-seed using existing connection if available
    if (agents.length === 0) {
      const seeded = await autoSeedPresetsIfEmpty(membership.orgId);
      if (seeded) {
        agents = await agentDb.findMany({
          where: { organizationId: membership.orgId },
          include: {
            connection: {
              select: {
                id: true,
                name: true,
                dbType: true,
                dbName: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        });
      }
    }

    return {
      success: true,
      data: agents.map((a: AgentEntity) => ({
        id: a.id,
        organizationId: a.organizationId,
        connectionId: a.connectionId,
        name: a.name,
        description: a.description,
        intentKeywords: a.intentKeywords,
        systemPrompt: a.systemPrompt,
        tableScope: a.tableScope,
        createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
        updatedAt: a.updatedAt instanceof Date ? a.updatedAt.toISOString() : String(a.updatedAt),
        connection: a.connection,
      })),
    };
  } catch (error) {
    console.error("[getAgents] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load agents",
    };
  }
}

/**
 * Fetch available tables from a DbConnection
 * Checks schemaContext cache first; falls back to querying the database directly.
 */
export async function getConnectionTables(
  connectionId: string
): Promise<ServerActionResponse<{ tables: string[] }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized" };
    }

    const conn = await prisma.dbConnection.findFirst({
      where: {
        id: connectionId,
        organization: {
          members: {
            some: { userId: session.user.id },
          },
        },
      },
    });

    if (!conn) {
      return { success: false, error: "Database connection not found or unauthorized." };
    }

    const tablesSet = new Set<string>();

    // 1. Try extracting tables from cached schemaContext
    if (conn.schemaContext) {
      const matches = [...conn.schemaContext.matchAll(/- \*\*([^*]+)\*\*/g)];
      for (const m of matches) {
        const raw = m[1].trim();
        // Remove schema prefix like "dbo." if present, but keep clean name
        const clean = raw.includes(".") ? raw.split(".").pop()! : raw;
        if (clean) tablesSet.add(clean);
      }
    }

    // 2. If tables list is empty or small and engine is MSSQL, introspect directly
    if (tablesSet.size === 0 && conn.dbType.toLowerCase() === "mssql") {
      let pool: sql.ConnectionPool | null = null;
      try {
        const plainPassword = decryptPassword(conn.encryptedPassword);
        const baseConfig: sql.config = {
          server: conn.host,
          port: Number(conn.port) || 1433,
          database: conn.dbName,
          user: conn.username,
          password: plainPassword,
          connectionTimeout: 8000,
          requestTimeout: 15000,
        };

        try {
          pool = new sql.ConnectionPool({
            ...baseConfig,
            options: { encrypt: true, trustServerCertificate: true },
          });
          await pool.connect();
        } catch {
          pool = new sql.ConnectionPool({
            ...baseConfig,
            options: { encrypt: false, trustServerCertificate: true },
          });
          await pool.connect();
        }

        const res = await pool.request().query<{ TABLE_NAME: string }>(`
          SELECT TABLE_NAME
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_TYPE IN ('BASE TABLE', 'VIEW')
            AND TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA')
            AND TABLE_NAME != 'sysdiagrams'
          ORDER BY TABLE_NAME;
        `);

        for (const row of res.recordset) {
          tablesSet.add(row.TABLE_NAME);
        }
      } catch (err) {
        console.warn("[getConnectionTables] MSSQL live query fallback notice:", err);
      } finally {
        if (pool) {
          try { await pool.close(); } catch {}
        }
      }
    }

    // Always include common Dynamics AX tables as options if connected to Dynamics AX
    const defaultDynAxTables = [
      "SalesTable", "SalesLine", "CustTable", "CustGroup", "CustInvoiceJour", "CustInvoiceTrans",
      "InventTable", "InventTrans", "InventDim", "InventSum", "PurchTable", "PurchLine",
      "VendTable", "LedgerJournalTable", "LedgerJournalTrans", "BankAccountTable", "GeneralJournalEntry"
    ];

    for (const dt of defaultDynAxTables) {
      tablesSet.add(dt);
    }

    const sortedTables = Array.from(tablesSet).sort((a, b) => a.localeCompare(b));

    return {
      success: true,
      data: { tables: sortedTables },
    };
  } catch (error) {
    console.error("[getConnectionTables] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load connection tables",
    };
  }
}

/**
 * Create a new Domain Agent
 */
export async function createAgent(
  input: CreateAgentInput
): Promise<ServerActionResponse<AgentData>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized: Active session required." };
    }

    const { organizationId, connectionId, name, description, intentKeywords, systemPrompt, tableScope } = input;

    if (!organizationId || !connectionId || !name || !description || !intentKeywords || !systemPrompt || !tableScope) {
      return { success: false, error: "All fields are required to build a Domain Agent." };
    }

    // Verify user belongs to this org
    const membership = await prisma.organizationUser.findFirst({
      where: {
        userId: session.user.id,
        orgId: organizationId,
      },
    });

    if (!membership) {
      return { success: false, error: "Forbidden: You are not authorized for this organization." };
    }

    // Clean and normalize tableScope (comma-separated clean names)
    const cleanTableScope = tableScope
      .split(",")
      .map((t) => t.trim().replace(/^\[|\]$/g, ""))
      .filter(Boolean)
      .join(", ");

    const newAgent = await agentDb.create({
      data: {
        organizationId,
        connectionId,
        name: name.trim(),
        description: description.trim(),
        intentKeywords: intentKeywords.trim(),
        systemPrompt: systemPrompt.trim(),
        tableScope: cleanTableScope,
      },
      include: {
        connection: {
          select: {
            id: true,
            name: true,
            dbType: true,
            dbName: true,
          },
        },
      },
    });

    revalidatePath("/dashboard/agents");
    revalidatePath("/dashboard");
    revalidatePath("/");

    return {
      success: true,
      message: `Domain Agent "${newAgent.name}" created successfully.`,
      data: {
        id: newAgent.id,
        organizationId: newAgent.organizationId,
        connectionId: newAgent.connectionId,
        name: newAgent.name,
        description: newAgent.description,
        intentKeywords: newAgent.intentKeywords,
        systemPrompt: newAgent.systemPrompt,
        tableScope: newAgent.tableScope,
        createdAt: newAgent.createdAt instanceof Date ? newAgent.createdAt.toISOString() : String(newAgent.createdAt),
        updatedAt: newAgent.updatedAt instanceof Date ? newAgent.updatedAt.toISOString() : String(newAgent.updatedAt),
        connection: newAgent.connection,
      },
    };
  } catch (error) {
    console.error("[createAgent] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create agent",
    };
  }
}

/**
 * Delete a Domain Agent
 */
export async function deleteAgent(
  agentId: string,
  organizationId: string
): Promise<ServerActionResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized" };
    }

    const membership = await prisma.organizationUser.findFirst({
      where: {
        userId: session.user.id,
        orgId: organizationId,
      },
    });

    if (!membership) {
      return { success: false, error: "Forbidden: Unauthorized organization operation." };
    }

    await agentDb.delete({
      where: {
        id: agentId,
        organizationId,
      },
    });

    revalidatePath("/dashboard/agents");
    revalidatePath("/dashboard");
    revalidatePath("/");

    return {
      success: true,
      message: "Domain Agent removed successfully.",
    };
  } catch (error) {
    console.error("[deleteAgent] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete agent",
    };
  }
}

/**
 * Update an existing Domain Agent
 */
export async function updateAgent(
  input: UpdateAgentInput
): Promise<ServerActionResponse<AgentData>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized: Active session required." };
    }

    const { id, organizationId, connectionId, name, description, intentKeywords, systemPrompt, tableScope } = input;

    if (!id || !organizationId || !connectionId || !name || !description || !intentKeywords || !systemPrompt || !tableScope) {
      return { success: false, error: "All fields are required to update a Domain Agent." };
    }

    const membership = await prisma.organizationUser.findFirst({
      where: {
        userId: session.user.id,
        orgId: organizationId,
      },
    });

    if (!membership) {
      return { success: false, error: "Forbidden: You are not authorized for this organization." };
    }

    const cleanTableScope = tableScope
      .split(",")
      .map((t) => t.trim().replace(/^\[|\]$/g, ""))
      .filter(Boolean)
      .join(", ");

    const updatedAgent = await agentDb.update({
      where: {
        id,
        organizationId,
      },
      data: {
        connectionId,
        name: name.trim(),
        description: description.trim(),
        intentKeywords: intentKeywords.trim(),
        systemPrompt: systemPrompt.trim(),
        tableScope: cleanTableScope,
      },
      include: {
        connection: {
          select: {
            id: true,
            name: true,
            dbType: true,
            dbName: true,
          },
        },
      },
    });

    revalidatePath("/dashboard/agents");
    revalidatePath("/dashboard");
    revalidatePath("/");

    return {
      success: true,
      message: `Domain Agent "${updatedAgent.name}" updated successfully.`,
      data: {
        id: updatedAgent.id,
        organizationId: updatedAgent.organizationId,
        connectionId: updatedAgent.connectionId,
        name: updatedAgent.name,
        description: updatedAgent.description,
        intentKeywords: updatedAgent.intentKeywords,
        systemPrompt: updatedAgent.systemPrompt,
        tableScope: updatedAgent.tableScope,
        createdAt: updatedAgent.createdAt instanceof Date ? updatedAgent.createdAt.toISOString() : String(updatedAgent.createdAt),
        updatedAt: updatedAgent.updatedAt instanceof Date ? updatedAgent.updatedAt.toISOString() : String(updatedAgent.updatedAt),
        connection: updatedAgent.connection,
      },
    };
  } catch (error) {
    console.error("[updateAgent] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update agent",
    };
  }
}

/**
 * Explicit server action to seed all standard enterprise domain presets for a connection
 */
export async function seedDefaultPresetsAction(
  connectionId: string,
  orgIdParam?: string
): Promise<ServerActionResponse<{ count: number }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized: Active session required." };
    }

    const membership = await prisma.organizationUser.findFirst({
      where: {
        userId: session.user.id,
        ...(orgIdParam ? { orgId: orgIdParam } : {}),
      },
    });

    if (!membership) {
      return { success: false, error: "Organization membership not found." };
    }

    const orgId = membership.orgId;
    const conn = await prisma.dbConnection.findFirst({
      where: { id: connectionId, orgId },
    });

    if (!conn) {
      return { success: false, error: "Database connection not found or unauthorized." };
    }

    let createdCount = 0;
    for (const preset of DYNAMICS_AX_PRESETS) {
      // Check if agent already exists with this name
      const existing = await agentDb.findFirst({
        where: {
          organizationId: orgId,
          name: preset.name,
        },
      });

      if (!existing) {
        await agentDb.create({
          data: {
            organizationId: orgId,
            connectionId: conn.id,
            name: preset.name,
            description: preset.description,
            intentKeywords: preset.intentKeywords,
            systemPrompt: preset.systemPrompt,
            tableScope: preset.tableScope,
          },
        });
        createdCount++;
      }
    }

    revalidatePath("/dashboard/agents");
    revalidatePath("/dashboard");
    revalidatePath("/");

    return {
      success: true,
      message: `Successfully seeded ${createdCount} Enterprise Domain Agents.`,
      data: { count: createdCount },
    };
  } catch (error) {
    console.error("[seedDefaultPresetsAction] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to seed default presets",
    };
  }
}
