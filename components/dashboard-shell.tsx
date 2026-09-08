import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/sidebar";
import Header from "@/components/header";
import { QuerySessionProvider } from "@/lib/query-session-context";

interface DashboardShellProps {
  children: React.ReactNode;
}

export default async function DashboardShell({ children }: DashboardShellProps) {
  const session = await auth();

  // Strict Login Check: Unauthenticated users are redirected to login immediately
  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as {
    name?: string | null;
    email?: string | null;
    role?: string;
    orgId?: string;
    orgName?: string;
  };

  return (
    <QuerySessionProvider userId={session.user.id} orgId={user.orgId}>
      <div className="flex h-screen w-screen overflow-hidden bg-[#090d16]">
        <Sidebar user={user} />
        <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
          <Header user={user} />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </QuerySessionProvider>
  );
}
