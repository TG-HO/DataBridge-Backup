import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/sidebar";
import Header from "@/components/header";
import { QuerySessionProvider } from "@/lib/query-session-context";
import { prisma } from "@/lib/prisma";

interface DashboardShellProps {
  children: React.ReactNode;
  noScroll?: boolean;
}

export default async function DashboardShell({
  children,
  noScroll = false,
}: DashboardShellProps) {
  const session = await auth();

  // Strict Login Check: Unauthenticated users are redirected to login immediately
  if (!session?.user) {
    redirect("/login");
  }

  const user = { ...(session.user as {
    name?: string | null;
    email?: string | null;
    role?: string;
    orgId?: string;
    orgName?: string;
    orgCode?: string;
  }) };

  if (!user.orgId && session.user.id) {
    try {
      const membership = await prisma.organizationUser.findFirst({
        where: { userId: session.user.id },
        include: { organization: true },
      });
      if (membership) {
        user.orgId = membership.orgId;
        user.orgName = membership.organization.name;
        user.role = membership.role;
      }
    } catch (e) {
      console.warn("[DashboardShell] Error finding user membership:", e);
    }
  }

  return (
    <QuerySessionProvider userId={session.user.id} orgId={user.orgId}>
      <div className="flex h-screen w-screen overflow-hidden bg-[#09090B]">
        <Sidebar user={user} />
        <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
          <Header user={user} />
          <main className={`flex-1 min-h-0 relative flex flex-col ${noScroll ? "overflow-hidden" : "overflow-y-auto"}`}>
            {children}
          </main>
        </div>
      </div>
    </QuerySessionProvider>
  );
}
