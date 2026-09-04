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
    <header className="h-16 border-b border-white/10 bg-[#0c1220]/80 backdrop-blur-md px-6 flex items-center justify-between z-20 shrink-0">
      {/* Left: Organization & Role Badge */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-300">
          <Building2 className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-semibold text-white truncate max-w-[200px]">{orgName}</span>
          <span
            className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-md border ${
              role === "OWNER"
                ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                : "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
            }`}
          >
            {role}
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/5 text-xs text-slate-400 font-mono">
          <Server className="w-3.5 h-3.5 text-emerald-400" />
          <span>Real-time Telemetry</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </div>
      </div>

      {/* Right: Actions, Real User Profile & Sign Out */}
      <div className="flex items-center gap-3">
        <PwaStatus />

        <div className="h-4 w-[1px] bg-white/10 hidden sm:block" />

        {/* User Badge */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-xs">
          <div className="w-6 h-6 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 text-[11px] font-bold">
            {userName.charAt(0).toUpperCase()}
          </div>
          <span className="hidden sm:inline text-slate-200 font-medium truncate max-w-[120px]">
            {userName}
          </span>
        </div>

        {/* Sign Out Button */}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/15 border border-white/10 hover:border-rose-500/30 text-slate-300 hover:text-rose-300 transition-all flex items-center gap-1.5 text-xs font-medium"
          title="Sign Out"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Sign Out</span>
        </button>
      </div>
    </header>
  );
}
