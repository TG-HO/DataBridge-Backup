import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const organizations = await prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: {
          select: {
            members: true,
            dbConnections: true,
          },
        },
      },
      take: 20,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ organizations });
  } catch (error) {
    console.error("Failed to fetch organizations:", error);
    return NextResponse.json(
      { organizations: [], error: "Database unreachable or uninitialized" },
      { status: 200 }
    );
  }
}
