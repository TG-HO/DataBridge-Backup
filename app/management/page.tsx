import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import DashboardShell from "@/components/dashboard-shell";
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
  Activity,
  Layers,
  Sparkles,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ManagementPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;

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
      <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-600/30">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
                  <span>{organization.name}</span>
                  <span
                    className={`text-xs font-mono font-medium px-2.5 py-0.5 rounded-lg border ${
                      isOwner
                        ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                        : "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                    }`}
                  >
                    {role}
                  </span>
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Database infrastructure telemetry, schema indexing, and connection health
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-md"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Open AI Chat Space</span>
            </Link>

            {isOwner && (
              <Link
                href="/settings/connections"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Data Source</span>
              </Link>
            )}
          </div>
        </div>

        {/* Real Metrics Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-white/10 backdrop-blur-xl space-y-2 shadow-xl hover:border-indigo-500/30 transition-all">
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

          <div className="p-5 rounded-2xl bg-slate-900/70 border border-white/10 backdrop-blur-xl space-y-2 shadow-xl hover:border-emerald-500/30 transition-all">
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

          <div className="p-5 rounded-2xl bg-slate-900/70 border border-white/10 backdrop-blur-xl space-y-2 shadow-xl hover:border-blue-500/30 transition-all">
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

        {/* Configured Data Sources List */}
        <div className="rounded-2xl bg-slate-900/70 border border-white/10 backdrop-blur-xl p-6 shadow-2xl space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">Active Data Sources</h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-400">
                {connections.length} configured
              </span>
            </div>
            {isOwner && (
              <Link
                href="/settings/connections"
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 transition-colors"
              >
                <span>Manage Connections</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {connections.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <Database className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-xs text-slate-400">No database connections configured yet.</p>
              {isOwner && (
                <Link
                  href="/settings/connections"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Connect Database</span>
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="p-5 rounded-xl bg-slate-950/70 border border-white/5 hover:border-white/15 transition-all space-y-3 shadow-lg"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Server className="w-4 h-4 text-indigo-400" />
                        <span>{conn.name}</span>
                      </h4>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        {conn.host}:{conn.port}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                      {conn.dbType}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-400 bg-black/40 p-3 rounded-lg border border-white/5">
                    <div>
                      <span className="text-slate-500">Database:</span> {conn.dbName}
                    </div>
                    <div>
                      <span className="text-slate-500">User:</span> {conn.username}
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-white/5">
                      {conn.schemaContext ? (
                        <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          RAG Schema Injected &amp; Synced
                        </span>
                      ) : (
                        <span className="text-amber-400 flex items-center gap-1 text-[11px]">
                          <AlertCircle className="w-3.5 h-3.5" />
                          Schema not synced
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
