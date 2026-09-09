import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import DashboardShell from "@/components/dashboard-shell";
import RealtimeQueryConsole from "@/components/realtime-query-console";
import {
  Database,
  Plus,
  Building2,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();

  // Enforce authentication: Login is MUST before dashboard
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;

  // Retrieve user's organization and role from the junction table
  const membership = await prisma.organizationUser.findFirst({
    where: { userId },
    include: {
      organization: true,
    },
  });

  if (!membership) {
    return (
      <DashboardShell>
        <div className="max-w-4xl mx-auto py-12 text-center space-y-4">
          <Building2 className="w-12 h-12 mx-auto text-slate-500" />
          <h2 className="text-lg font-bold text-white">No Organization Found</h2>
          <p className="text-xs text-slate-400">
            Your account is not currently assigned to an organization tenant.
          </p>
        </div>
      </DashboardShell>
    );
  }

  const { organization, role } = membership;
  const isOwner = role === "OWNER";

  // Fetch genuine configured database connections for this organization
  const connections = await prisma.dbConnection.findMany({
    where: { orgId: organization.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      dbType: true,
      host: true,
      port: true,
      dbName: true,
      username: true,
      schemaContext: true,
      createdAt: true,
    },
  });

  return (
    <DashboardShell>
      <div className="flex-1 flex flex-col h-full w-full relative">
        {connections.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="p-10 rounded-3xl bg-slate-900/60 border border-white/10 backdrop-blur-xl text-center space-y-5 max-w-lg shadow-2xl">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/15 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400 shadow-inner">
                <Database className="w-7 h-7" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  No Database Connections Configured
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Connect your SQL Server, MySQL, Postgres, or other databases to enable natural language business querying.
                </p>
              </div>

              {isOwner ? (
                <Link
                  href="/settings/connections"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-lg shadow-indigo-600/20"
                >
                  <Plus className="w-4 h-4" />
                  <span>Configure Databases</span>
                </Link>
              ) : (
                <p className="text-xs text-amber-400/90 font-mono bg-amber-400/10 py-2 px-4 rounded-xl inline-block border border-amber-400/20">
                  Notice: Only Organization Owners have permission to add database credentials.
                </p>
              )}
            </div>
          </div>
        ) : (
          <RealtimeQueryConsole
            connections={connections}
            userRole={role}
          />
        )}
      </div>
    </DashboardShell>
  );
}
