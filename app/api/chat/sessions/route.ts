import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DEFAULT_WELCOME_CONTENT =
  "## Executive Database Assistant Ready\n\nAsk any business or operational question in natural language. You can query a single database or select multiple databases simultaneously to synthesize cross-system intelligence.\n\n### Suggested Queries:\n- *\"List our top 10 customers by order volume with their status.\"*\n- *\"Show customer breakdown across retail and enterprise databases.\"*\n- *\"Summarize overall transaction performance and key metrics.\"*";

// GET: Fetch all query sessions for current user and active organization
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userObj = session.user as { orgId?: string };
    const orgId = userObj.orgId;

    if (!orgId) {
      return NextResponse.json({ error: "No active organization" }, { status: 400 });
    }

    const dbSessions = await prisma.querySession.findMany({
      where: {
        userId: session.user.id,
        orgId,
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const formattedSessions = dbSessions.map((s) => ({
      id: s.id,
      title: s.title,
      createdAt: s.createdAt.getTime(),
      updatedAt: s.updatedAt.getTime(),
      selectedConnIds: s.selectedConnIds ? JSON.parse(s.selectedConnIds) : [],
      messages: s.messages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: m.timestamp,
        connectionId: m.connectionId || undefined,
        rawQuery: m.rawQuery || undefined,
        isError: m.isError,
        errorMessage: m.errorMessage || undefined,
        targetedDatabases: m.targetedDatabases ? JSON.parse(m.targetedDatabases) : undefined,
      })),
    }));

    return NextResponse.json({ sessions: formattedSessions });
  } catch (error) {
    console.error("Failed to fetch query sessions:", error);
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}

// POST: Create a new query session in the database
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userObj = session.user as { orgId?: string };
    const orgId = userObj.orgId;

    if (!orgId) {
      return NextResponse.json({ error: "No active organization" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { title = "New Business Inquiry", selectedConnIds = [] } = body;

    const newSession = await prisma.querySession.create({
      data: {
        userId: session.user.id,
        orgId,
        title,
        selectedConnIds: JSON.stringify(selectedConnIds),
        messages: {
          create: {
            role: "assistant",
            content: DEFAULT_WELCOME_CONTENT,
            timestamp: "Active",
          },
        },
      },
      include: {
        messages: true,
      },
    });

    const formatted = {
      id: newSession.id,
      title: newSession.title,
      createdAt: newSession.createdAt.getTime(),
      updatedAt: newSession.updatedAt.getTime(),
      selectedConnIds,
      messages: newSession.messages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: m.timestamp,
        connectionId: m.connectionId || undefined,
        rawQuery: m.rawQuery || undefined,
        isError: m.isError,
        errorMessage: m.errorMessage || undefined,
      })),
    };

    return NextResponse.json({ session: formatted }, { status: 201 });
  } catch (error) {
    console.error("Failed to create query session:", error);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}

// DELETE: Remove a query session
export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("id");

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    // Verify user owns the session before deleting
    const existing = await prisma.querySession.findUnique({
      where: { id: sessionId },
    });

    if (!existing || existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Session not found or forbidden" }, { status: 404 });
    }

    await prisma.querySession.delete({
      where: { id: sessionId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete query session:", error);
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
