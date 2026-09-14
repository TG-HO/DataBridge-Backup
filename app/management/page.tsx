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
      <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 pb-12 font-sans">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[rgba(255,255,255,0.08)]">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-[6px] bg-[#18181B] border border-[rgba(255,255,255,0.08)] flex items-center justify-center text-[#00E599] shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)]">
                <Activity className="w-4 h-4 text-[#00E599]" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold text-[#FAFAFA] tracking-tight flex items-center gap-2.5">
                  <span>{organization.name}</span>
                  <span
                    className={`text-xs font-mono font-medium px-2.5 py-0.5 rounded-[6px] border ${
                      isOwner
                        ? "bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30"
                        : "bg-[#00E599]/15 text-[#00E599] border-[#00E599]/30"
                    }`}
                  >
                    {role}
                  </span>
                </h1>
                <p className="text-xs text-[#A1A1AA] mt-0.5">
                  Database infrastructure telemetry, schema indexing, and connection health
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="px-3.5 py-2 rounded-[6px] bg-[#18181B] hover:bg-[#27272A] border border-[rgba(255,255,255,0.08)] text-[#FAFAFA] text-xs font-medium flex items-center gap-2 transition-all shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)]"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#00E599]" />
              <span>Open AI Chat Space</span>
            </Link>

            {isOwner && (
              <Link
                href="/settings/connections"
                className="px-3.5 py-2 rounded-[6px] bg-[#00E599] hover:bg-[#00E599]/90 text-[#09090B] text-xs font-semibold flex items-center gap-2 transition-all shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#09090B]" />
                <span>Add Data Source</span>
              </Link>
            )}
          </div>
        </div>

        {/* Real Metrics Overview Cards (L1) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-5 rounded-[10px] bg-[#121215] border border-[rgba(255,255,255,0.08)] space-y-2 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)] hover:border-[rgba(255,255,255,0.15)] transition-all">
            <div className="flex items-center justify-between text-[#A1A1AA]">
              <span className="text-xs font-medium">Connected Databases</span>
              <Database className="w-4 h-4 text-[#0EA5E9]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#FAFAFA] font-mono">
                {connections.length}
              </span>
              <span className="text-[11px] text-[#71717A]">active sources</span>
            </div>
          </div>

          <div className="p-5 rounded-[10px] bg-[#121215] border border-[rgba(255,255,255,0.08)] space-y-2 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)] hover:border-[#10B981]/30 transition-all">
            <div className="flex items-center justify-between text-[#A1A1AA]">
              <span className="text-xs font-medium">Schemas Synced (RAG)</span>
              <FileCode2 className="w-4 h-4 text-[#10B981]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#10B981] font-mono">
                {schemaReadyCount} / {connections.length}
              </span>
              <span className="text-[11px] text-[#71717A]">ready for AI prompts</span>
            </div>
          </div>

          <div className="p-5 rounded-[10px] bg-[#121215] border border-[rgba(255,255,255,0.08)] space-y-2 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)] hover:border-[rgba(255,255,255,0.15)] transition-all">
            <div className="flex items-center justify-between text-[#A1A1AA]">
              <span className="text-xs font-medium">Access Authorization</span>
              <ShieldCheck className="w-4 h-4 text-[#8B5CF6]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-[#FAFAFA] font-mono">
                {isOwner ? "Owner (Full Admin)" : "Member (Query Only)"}
              </span>
            </div>
          </div>
        </div>

        {/* Configured Data Sources List */}
        <div className="rounded-[10px] bg-[#121215] border border-[rgba(255,255,255,0.08)] p-6 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)] space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[rgba(255,255,255,0.08)]">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-[#00E599]" />
              <h3 className="text-sm font-semibold text-[#FAFAFA]">Active Data Sources</h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-[6px] bg-[#18181B] border border-[rgba(255,255,255,0.08)] text-[#A1A1AA]">
                {connections.length} configured
              </span>
            </div>
            {isOwner && (
              <Link
                href="/settings/connections"
                className="text-xs text-[#00E599] hover:text-[#00E599]/80 font-medium flex items-center gap-1 transition-colors"
              >
                <span>Manage Connections</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {connections.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <Database className="w-8 h-8 mx-auto text-[#71717A]" />
              <p className="text-xs text-[#A1A1AA]">No database connections configured yet.</p>
              {isOwner && (
                <Link
                  href="/settings/connections"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[6px] bg-[#00E599] text-[#09090B] text-xs font-semibold"
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
                  className="p-5 rounded-[6px] bg-[#18181B] border border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)] transition-all space-y-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-[#FAFAFA] flex items-center gap-2">
                        <Server className="w-4 h-4 text-[#00E599]" />
                        <span>{conn.name}</span>
                      </h4>
                      <p className="text-xs text-[#A1A1AA] font-mono mt-0.5">
                        {conn.host}:{conn.port}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-[6px] bg-[#00E599]/10 text-[#00E599] border border-[#00E599]/20">
                      {conn.dbType}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono text-[#A1A1AA] bg-[#121215] p-3 rounded-[6px] border border-[rgba(255,255,255,0.08)]">
                    <div>
                      <span className="text-[#71717A]">Database:</span> {conn.dbName}
                    </div>
                    <div>
                      <span className="text-[#71717A]">User:</span> {conn.username}
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-[rgba(255,255,255,0.08)]">
                      {conn.schemaContext ? (
                        <span className="text-[#10B981] flex items-center gap-1 text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          RAG Schema Injected &amp; Synced
                        </span>
                      ) : (
                        <span className="text-[#F59E0B] flex items-center gap-1 text-[11px]">
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
