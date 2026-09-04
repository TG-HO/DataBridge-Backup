import { PrismaClient } from "@prisma/client";
import { PrismaMssql } from "@prisma/adapter-mssql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString =
    process.env.DATABASE_URL ||
    "sqlserver://localhost:1433;database=databridge_ai;user=sa;password=YourStrong@Password123;encrypt=true;trustServerCertificate=true";

  try {
    const adapter = new PrismaMssql(connectionString, {
      onConnectionError: (err) => {
        // Graceful error logging when MSSQL server is offline or during build phase
        console.warn("[PrismaMssql] Connection notice:", err instanceof Error ? err.message : String(err));
      },
      onPoolError: (err) => {
        console.warn("[PrismaMssql] Pool notice:", err instanceof Error ? err.message : String(err));
      },
    });
    return new PrismaClient({ adapter });
  } catch (error) {
    console.warn("Failed to initialize PrismaMssql adapter, falling back to standard client:", error);
    return new PrismaClient();
  }
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
