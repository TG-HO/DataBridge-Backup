"use client";

import { Server, Building2, LogOut } from "lucide-react";
import PwaStatus from "./pwa-status";
import { signOut } from "next-auth/react";

interface HeaderProps {
  user?: {
    name?: string | null;
    email?: string | null;
    role?: string;
    orgId?: string;
    orgName?: string;
  };
}

export default function Header({ user }: HeaderProps) {
  const orgName = user?.orgName || "Enterprise Workspace";
  const role = user?.role || "MEMBER";
  const userName = user?.name || user?.email?.split("@")[0] || "User";

  return (
    <header className="h-16 border-b border-white/[0.08] bg-[#121215]/90 backdrop-blur-md px-6 flex items-center justify-between z-20 shrink-0">
      {/* Left: Organization & Role Badge */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] bg-[#18181B] border border-white/[0.08] text-xs text-[#FAFAFA]">
          <Building2 className="w-3.5 h-3.5 text-[#00E599]" />
          <span className="font-semibold text-[#FAFAFA] truncate max-w-[200px]">{orgName}</span>
          <span
            className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-[4px] border ${
              role === "OWNER"
                ? "bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30"
                : "bg-[#00E599]/15 text-[#00E599] border-[#00E599]/30"
            }`}
          >
            {role}
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-[6px] bg-[#18181B] border border-white/[0.08] text-xs text-[#A1A1AA] font-mono">
          <Server className="w-3.5 h-3.5 text-[#10B981]" />
          <span>Real-time Telemetry</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
        </div>
      </div>

      {/* Right: Actions, Real User Profile & Sign Out */}
      <div className="flex items-center gap-3">
        <PwaStatus />

        <div className="h-4 w-[1px] bg-white/[0.08] hidden sm:block" />

        {/* User Badge */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-[6px] bg-[#18181B] border border-white/[0.08] text-xs">
          <div className="w-6 h-6 rounded-[4px] bg-[#00E599]/20 border border-[#00E599]/30 flex items-center justify-center text-[#00E599] text-[11px] font-bold">
            {userName.charAt(0).toUpperCase()}
          </div>
          <span className="hidden sm:inline text-[#FAFAFA] font-medium truncate max-w-[120px]">
            {userName}
          </span>
        </div>

        {/* Sign Out Button */}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="p-2 rounded-[6px] bg-[#18181B] hover:bg-rose-500/15 border border-white/[0.08] hover:border-rose-500/30 text-[#A1A1AA] hover:text-rose-300 transition-all flex items-center gap-1.5 text-xs font-medium cursor-pointer"
          title="Sign Out"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Sign Out</span>
        </button>
      </div>
    </header>
  );
}
