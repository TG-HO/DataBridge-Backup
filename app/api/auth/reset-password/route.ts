import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, orgCode, newPassword } = body;

    if (!email || !orgCode || !newPassword) {
      return NextResponse.json(
        { error: "Email, Organization Invite Code, and New Password are required" },
        { status: 400 }
      );
    }

    if (String(newPassword).length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters long" },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const cleanOrgCode = String(orgCode).trim().toUpperCase();

    // 1. Verify User exists
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (!user) {
      return NextResponse.json(
        { error: "No account found with this email address" },
        { status: 404 }
      );
    }

    // 2. Verify Organization exists
    const org = await prisma.organization.findFirst({
      where: {
        OR: [
          { inviteCode: cleanOrgCode },
          { id: cleanOrgCode },
        ],
      },
    });

    if (!org) {
      return NextResponse.json(
        { error: "Invalid Organization Invite Code" },
        { status: 404 }
      );
    }

    // 3. Verify user is actually a member of this organization
    const membership = await prisma.organizationUser.findFirst({
      where: {
        userId: user.id,
        orgId: org.id,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "This email address is not associated with the specified organization" },
        { status: 403 }
      );
    }

    // 4. Hash and update password
    const hashedPassword = await bcrypt.hash(String(newPassword), 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    return NextResponse.json({
      success: true,
      message: "Password has been successfully updated. You can now log in.",
    });
  } catch (error) {
    console.error("Password reset error:", error);
    return NextResponse.json(
      { error: "Failed to reset password. Please try again." },
      { status: 500 }
    );
  }
}
