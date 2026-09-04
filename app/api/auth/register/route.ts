import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, password, organizationMode, organizationName, existingOrgId } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters long" },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).toLowerCase().trim();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email address already exists" },
        { status: 409 }
      );
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Multi-tenant Organization Assignment logic
    if (organizationMode === "join" && existingOrgId) {
      // Validate existing organization
      const targetOrg = await prisma.organization.findUnique({
        where: { id: existingOrgId },
      });

      if (!targetOrg) {
        return NextResponse.json(
          { error: "The specified Organization ID does not exist" },
          { status: 404 }
        );
      }

      // Create user and attach to existing organization as MEMBER
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: name?.trim() || null,
            email: cleanEmail,
            password: hashedPassword,
          },
        });

        const membership = await tx.organizationUser.create({
          data: {
            orgId: targetOrg.id,
            userId: user.id,
            role: "MEMBER",
          },
        });

        return { user, organization: targetOrg, membership };
      });

      return NextResponse.json(
        {
          success: true,
          message: "User registered and joined organization successfully",
          user: {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
          },
          organization: {
            id: result.organization.id,
            name: result.organization.name,
            role: result.membership.role,
          },
        },
        { status: 201 }
      );
    }

    // Default: Create a new Organization and assign user as OWNER
    const orgName = organizationName?.trim() || `${name?.trim() || "Enterprise"} Workspace`;

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: name?.trim() || null,
          email: cleanEmail,
          password: hashedPassword,
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: orgName,
        },
      });

      const membership = await tx.organizationUser.create({
        data: {
          orgId: organization.id,
          userId: user.id,
          role: "OWNER",
        },
      });

      return { user, organization, membership };
    });

    return NextResponse.json(
      {
        success: true,
        message: "User and Organization created successfully",
        user: {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
        },
        organization: {
          id: result.organization.id,
          name: result.organization.name,
          role: result.membership.role,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    const errMessage = error instanceof Error ? error.message : "Unknown error";
    const isDbConnectionError =
      errMessage.includes("Failed to connect") ||
      errMessage.includes("ESOCKET") ||
      errMessage.includes("Can't reach database server");

    return NextResponse.json(
      {
        error: isDbConnectionError
          ? "Database Connection Error: Could not connect to Microsoft SQL Server on localhost:1433."
          : "Internal server error occurred during registration",
        details: isDbConnectionError
          ? "Please ensure your project SQL Server instance is started and run 'npx prisma db push' to create the tables."
          : errMessage,
      },
      { status: 500 }
    );
  }
}
