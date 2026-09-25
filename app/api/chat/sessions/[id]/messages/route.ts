import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: sessionId } = await params;
    if (!sessionId) {
      return NextResponse.json({ error: "Session ID required" }, { status: 400 });
    }

    // Verify session belongs to user
    const dbSession = await prisma.querySession.findUnique({
      where: { id: sessionId },
    });

    if (!dbSession || dbSession.userId !== session.user.id) {
      return NextResponse.json({ error: "Session not found or unauthorized" }, { status: 404 });
    }

    const body = await req.json();
    const { title, selectedConnIds, message, messages } = body;

    // 1. Update session metadata if provided
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (title !== undefined) updateData.title = title;
    if (selectedConnIds !== undefined) updateData.selectedConnIds = JSON.stringify(selectedConnIds);

    await prisma.querySession.update({
      where: { id: sessionId },
      data: updateData,
    });

    // 2. Append single message if provided
    if (message) {
      const createdMsg = await prisma.chatMessage.create({
        data: {
          sessionId,
          role: message.role || "user",
          content: message.content || "",
          timestamp: message.timestamp || "Just now",
          connectionId: message.connectionId || null,
          rawQuery: message.rawQuery || null,
          isError: Boolean(message.isError),
          errorMessage: message.errorMessage || null,
          targetedDatabases: message.targetedDatabases
            ? JSON.stringify(message.targetedDatabases)
            : null,
        },
      });

      return NextResponse.json({ success: true, message: createdMsg });
    }

    // 3. Batch sync messages if provided (upsert existing and insert new)
    if (Array.isArray(messages) && messages.length > 0) {
      // Find existing message IDs in DB for this session
      const existingMsgs = await prisma.chatMessage.findMany({
        where: { sessionId },
        select: { id: true, content: true },
      });
      const existingIds = new Set(existingMsgs.map((m) => m.id));

      for (const m of messages) {
        if (!m || m.id === "welcome-message") continue;

        if (existingIds.has(m.id)) {
          // Update message with latest completed content and metadata
          await prisma.chatMessage.update({
            where: { id: m.id },
            data: {
              content: m.content || "",
              connectionId: m.connectionId || null,
              rawQuery: m.rawQuery || null,
              isError: Boolean(m.isError),
              errorMessage: m.errorMessage || null,
              targetedDatabases: m.targetedDatabases
                ? JSON.stringify(m.targetedDatabases)
                : null,
            },
          });
        } else {
          // Insert new message
          await prisma.chatMessage.create({
            data: {
              id: m.id,
              sessionId,
              role: m.role || "user",
              content: m.content || "",
              timestamp: m.timestamp || "Active",
              connectionId: m.connectionId || null,
              rawQuery: m.rawQuery || null,
              isError: Boolean(m.isError),
              errorMessage: m.errorMessage || null,
              targetedDatabases: m.targetedDatabases
                ? JSON.stringify(m.targetedDatabases)
                : null,
            },
          });
        }
      }

      return NextResponse.json({ success: true, syncedCount: messages.length });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update session messages:", error);
    return NextResponse.json({ error: "Failed to persist message" }, { status: 500 });
  }
}
