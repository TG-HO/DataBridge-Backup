import { auth } from "@/auth";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import DashboardGrid from "@/components/dashboard-grid";
import { getDashboards, getDashboardWithWidgets } from "@/app/actions/dashboard";

export const dynamic = "force-dynamic";

interface DashboardPageProps {
  searchParams?: Promise<{ id?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedDashId = resolvedSearchParams?.id;

  const [dashboardsRes, activeDashRes] = await Promise.all([
    getDashboards(),
    getDashboardWithWidgets(requestedDashId),
  ]);

  if (!dashboardsRes.success || !activeDashRes.success || !activeDashRes.dashboard) {
    return (
      <DashboardShell>
        <div className="flex-1 flex items-center justify-center p-8 text-neutral-400 text-xs">
          <span>Failed to load organization dashboard workspace.</span>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <DashboardGrid
        initialDashboard={activeDashRes.dashboard}
        dashboards={dashboardsRes.dashboards}
        initialWidgets={activeDashRes.widgets}
      />
    </DashboardShell>
  );
}
