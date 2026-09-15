import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const membership = await prisma.organizationUser.findFirst({
      where: { userId: session.user.id },
      include: {
        organization: {
          include: {
            _count: {
              select: {
                members: true,
                dbConnections: true,
              },
            },
          },
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    return NextResponse.json({
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        inviteCode: (membership.organization as any).inviteCode,
        role: membership.role,
        _count: membership.organization._count,
      },
    });
  } catch (error) {
    console.error("Failed to fetch organization details:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
