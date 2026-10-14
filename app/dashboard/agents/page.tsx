import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import AgentBuilder from "@/components/agent-builder";
import { getAgents } from "@/app/actions/agents";
import { Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AgentsDashboardPage() {
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
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md mx-auto text-center space-y-4">
            <Building2 className="w-12 h-12 mx-auto text-neutral-500" />
            <h2 className="text-lg font-bold text-white">No Organization Found</h2>
            <p className="text-xs text-neutral-400">
              Your account is not assigned to an organization tenant. Please join or create an
              organization first.
            </p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  const { organization, role } = membership;

  // Fetch connections for this org
  const connections = await prisma.dbConnection.findMany({
    where: { orgId: organization.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      dbType: true,
      dbName: true,
    },
  });

  // Fetch existing agents
  const agentsRes = await getAgents(organization.id);
  const initialAgents = agentsRes.success && agentsRes.data ? agentsRes.data : [];

  return (
    <DashboardShell>
      <div className="flex-1 overflow-y-auto">
        <AgentBuilder
          organizationId={organization.id}
          organizationName={organization.name}
          userRole={role}
          initialAgents={initialAgents}
          connections={connections}
        />
      </div>
    </DashboardShell>
  );
}
