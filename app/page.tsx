import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import DashboardShell from "@/components/dashboard-shell";
import RealtimeQueryConsole from "@/components/realtime-query-console";
import {
  Database,
  Plus,
  ShieldCheck,
  Server,
  ArrowUpRight,
  HardDrive,
  FileCode2,
  CheckCircle2,
  AlertCircle,
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

  const schemaReadyCount = connections.filter((c) => Boolean(c.schemaContext)).length;

  return (
    <DashboardShell>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Modern Enterprise Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {organization.name}
              </h1>
              <span
                className={`text-xs font-mono font-medium px-2.5 py-0.5 rounded-lg border ${
                  isOwner
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                    : "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                }`}
              >
                Role: {role}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Real-time multi-tenant database intelligence &amp; dynamic RAG query engine
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isOwner ? (
              <Link
                href="/settings/connections"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Configure Databases</span>
              </Link>
            ) : (
              <span className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-400">
                Read-Only Member Access
              </span>
            )}
          </div>
        </div>

        {/* Real Metrics Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-xl space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Connected Databases</span>
              <Database className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white font-mono">
                {connections.length}
              </span>
              <span className="text-[11px] text-slate-500">active sources</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-xl space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Schemas Synced (RAG)</span>
              <FileCode2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-400 font-mono">
                {schemaReadyCount} / {connections.length}
              </span>
              <span className="text-[11px] text-slate-500">ready for AI prompts</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-xl space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">Access Authorization</span>
              <ShieldCheck className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold text-slate-200 font-mono">
                {isOwner ? "Owner (Full Admin)" : "Member (Query Only)"}
              </span>
            </div>
          </div>
        </div>

        {/* Empty State vs Real Connections Display */}
        {connections.length === 0 ? (
          <div className="p-12 rounded-3xl bg-slate-900/40 border border-dashed border-white/10 text-center space-y-5 max-w-2xl mx-auto my-8">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/15 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400">
              <Database className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-white">
                No Database Connections Configured
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Connect your organization&apos;s Microsoft SQL Server database to extract schema metadata and start asking AI-powered intelligence queries.
              </p>
            </div>

            {isOwner ? (
              <Link
                href="/settings/connections"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-lg shadow-indigo-600/20"
              >
                <Plus className="w-4 h-4" />
                <span>Connect Your First Database</span>
              </Link>
            ) : (
              <p className="text-xs text-amber-400/90 font-mono bg-amber-400/10 py-2 px-4 rounded-xl inline-block border border-amber-400/20">
                Notice: Only Organization Owners have permission to add database credentials.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Interactive Realtime Query Console */}
            <RealtimeQueryConsole
              connections={connections}
              userRole={role}
            />

            {/* Configured Data Sources List */}
            <div className="rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white">Active Data Sources</h3>
                </div>
                {isOwner && (
                  <Link
                    href="/settings/connections"
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
                  >
                    <span>Manage Connections</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {connections.map((conn) => (
                  <div
                    key={conn.id}
                    className="p-4 rounded-xl bg-slate-950/60 border border-white/5 hover:border-white/10 transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-white flex items-center gap-2">
                          <Server className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{conn.name}</span>
                        </h4>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {conn.host}:{conn.port}
                        </p>
                      </div>
                      <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        {conn.dbType}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-400 bg-black/40 p-2.5 rounded-lg border border-white/5">
                      <div>
                        <span className="text-slate-500">Database:</span> {conn.dbName}
                      </div>
                      <div>
                        <span className="text-slate-500">User:</span> {conn.username}
                      </div>
                      <div className="col-span-2 flex items-center gap-1.5 mt-1">
                        {conn.schemaContext ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            RAG Schema Injected
                          </span>
                        ) : (
                          <span className="text-amber-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Schema not synced
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
