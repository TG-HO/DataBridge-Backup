"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Settings,
  History,
  Building2,
  Database,
  Terminal,
  Plus,
  Trash2,
  LayoutDashboard,
} from "lucide-react";
import { useQuerySessions } from "@/lib/query-session-context";

interface SidebarProps {
  user?: {
    name?: string | null;
    email?: string | null;
    role?: string;
    orgId?: string;
    orgName?: string;
  };
}

export default function Sidebar({ user }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const {
    sessions,
    activeSessionId,
    createNewSession,
    selectSession,
    deleteSession,
  } = useQuerySessions();

  const orgName = user?.orgName || "Enterprise Workspace";
  const role = user?.role || "MEMBER";

  // Filter out any sessions without user messages for the history count display, or display all
  const displaySessions = sessions;

  return (
    <aside
      className={`relative flex flex-col h-screen border-r border-white/[0.08] bg-[#121215] transition-all duration-300 ease-in-out select-none z-30 shrink-0 ${
        isCollapsed ? "w-16" : "w-72"
      }`}
    >
      {/* Top Header & Brand */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-white/[0.08]">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[6px] bg-gradient-to-tr from-[#00E599] to-[#10B981] flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 text-[#09090B]" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm text-[#FAFAFA] tracking-tight">
                DataBridge <span className="text-[#00E599]">AI</span>
              </span>
              <span className="text-[10px] text-[#A1A1AA] font-mono">
                MSSQL RAG Engine
              </span>
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 mx-auto rounded-[6px] bg-gradient-to-tr from-[#00E599] to-[#10B981] flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-[#09090B]" />
          </div>
        )}

        {/* Toggle Collapse Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded-[6px] text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#18181B] transition-colors cursor-pointer"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Navigation Quick Links */}
      <div className="p-3 border-b border-white/[0.08] space-y-1">
        <Link
          href="/"
          className="w-full flex items-center gap-2.5 p-2 rounded-[6px] bg-[#18181B] hover:bg-[#18181B]/80 border border-white/[0.08] text-[#FAFAFA] text-xs font-medium transition-all group"
          title="AI Query Space (Chat Screen)"
        >
          <Sparkles className="w-4 h-4 text-[#00E599] shrink-0 group-hover:scale-110 transition-transform" />
          {!isCollapsed && (
            <div className="flex items-center justify-between flex-1">
              <span>AI Query Space</span>
              <span className="text-[9px] font-mono text-[#00E599] bg-[#00E599]/10 px-1.5 py-0.5 rounded-[4px] border border-[#00E599]/20">
                Chat
              </span>
            </div>
          )}
        </Link>
        <Link
          href="/dashboard"
          className="w-full flex items-center gap-2.5 p-2 rounded-[6px] hover:bg-[#18181B]/60 text-[#A1A1AA] hover:text-[#FAFAFA] text-xs font-medium transition-all group"
          title="Customizable Grid Dashboards"
        >
          <LayoutDashboard className="w-4 h-4 text-[#8B5CF6] shrink-0 group-hover:scale-110 transition-transform" />
          {!isCollapsed && (
            <div className="flex items-center justify-between flex-1">
              <span>Dashboards</span>
              <span className="text-[9px] font-mono text-[#8B5CF6] bg-[#8B5CF6]/10 px-1.5 py-0.5 rounded-[4px] border border-[#8B5CF6]/20">
                Grid
              </span>
            </div>
          )}
        </Link>
        <Link
          href="/management"
          className="w-full flex items-center gap-2.5 p-2 rounded-[6px] hover:bg-[#18181B]/60 text-[#A1A1AA] hover:text-[#FAFAFA] text-xs font-medium transition-all group"
          title="Overview & Management (Cards & Sources)"
        >
          <Terminal className="w-4 h-4 text-[#0EA5E9] shrink-0 group-hover:scale-110 transition-transform" />
          {!isCollapsed && <span>Overview &amp; Sources</span>}
        </Link>
        <Link
          href="/settings/connections"
          className="w-full flex items-center gap-2.5 p-2 rounded-[6px] hover:bg-[#18181B]/60 text-[#A1A1AA] hover:text-[#FAFAFA] text-xs font-medium transition-all group"
          title="Manage Databases"
        >
          <Database className="w-4 h-4 text-[#10B981] shrink-0 group-hover:scale-110 transition-transform" />
          {!isCollapsed && (
            <div className="flex items-center justify-between flex-1">
              <span>Databases</span>
              {role === "OWNER" && (
                <span className="text-[9px] font-mono text-[#F59E0B] bg-[#F59E0B]/10 px-1.5 py-0.5 rounded-[4px] border border-[#F59E0B]/20">
                  Manage
                </span>
              )}
            </div>
          )}
        </Link>
      </div>

      {/* Query Sessions Section */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Header & New Session Button */}
        {!isCollapsed ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] uppercase font-mono tracking-wider text-[#A1A1AA]">
                Query Sessions
              </span>
              <span className="text-[10px] font-mono text-[#A1A1AA]">
                {displaySessions.length}
              </span>
            </div>

            <button
              onClick={() => createNewSession()}
              className="w-full flex items-center justify-center gap-2 p-2 rounded-[6px] bg-[#00E599]/15 hover:bg-[#00E599]/25 border border-[#00E599]/30 text-[#00E599] hover:text-white text-xs font-semibold transition-all shadow-sm cursor-pointer group"
              title="Start a new query session"
            >
              <Plus className="w-3.5 h-3.5 text-[#00E599] group-hover:scale-110 transition-transform" />
              <span>New Query Session</span>
            </button>
          </div>
        ) : (
          <div className="flex justify-center mb-2">
            <button
              onClick={() => createNewSession()}
              className="p-2 rounded-[6px] bg-[#00E599]/20 hover:bg-[#00E599]/30 border border-[#00E599]/40 text-[#00E599] hover:text-white transition-all cursor-pointer"
              title="New Query Session"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}

        {displaySessions.length === 0 ? (
          <div className="py-8 px-2 text-center text-[#A1A1AA] text-xs">
            <History className="w-5 h-5 mx-auto mb-2 text-[#A1A1AA] opacity-50" />
            {!isCollapsed && (
              <>
                <p className="font-medium text-[#FAFAFA]">No Query History</p>
                <p className="text-[10px] text-[#A1A1AA] mt-1">
                  Run natural language queries on your connected database to build history.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {displaySessions.map((s) => {
              const isActive = activeSessionId === s.id;
              const hasUserQuery = s.messages.some((m) => m.role === "user");

              return (
                <div
                  key={s.id}
                  className={`group relative w-full flex items-center rounded-[6px] transition-all ${
                    isActive
                      ? "bg-[#18181B] text-[#FAFAFA] border border-[#00E599]/40 shadow-sm"
                      : "text-[#A1A1AA] hover:bg-[#18181B]/60 hover:text-[#FAFAFA] border border-transparent"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectSession(s.id)}
                    className="flex-1 flex items-center gap-2.5 p-2 text-left text-xs min-w-0 cursor-pointer"
                    title={s.title}
                  >
                    <MessageSquare
                      className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                        isActive ? "text-[#00E599]" : "text-[#A1A1AA] group-hover:text-[#FAFAFA]"
                      }`}
                    />
                    {!isCollapsed && (
                      <div className="truncate flex-1 min-w-0">
                        <p className="truncate font-medium">{s.title}</p>
                        <span className="text-[10px] text-[#A1A1AA] font-mono block">
                          {hasUserQuery
                            ? `${s.messages.filter((m) => m.role === "user").length} queries`
                            : "New chat"}
                        </span>
                      </div>
                    )}
                  </button>

                  {!isCollapsed && displaySessions.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(s.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 mr-1 text-[#A1A1AA] hover:text-rose-400 hover:bg-rose-500/10 rounded-[6px] transition-all cursor-pointer"
                      title="Delete query session"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Footer Area */}
      <div className="p-3 border-t border-white/[0.08] flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-[6px] bg-[#18181B] border border-white/[0.08] flex items-center justify-center text-xs font-bold text-[#00E599] shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col truncate">
                <span className="text-xs font-medium text-[#FAFAFA] truncate">
                  {orgName}
                </span>
                <span className="text-[10px] text-[#00E599] flex items-center gap-1 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00E599]" />
                  Role: {role}
                </span>
              </div>
            )}
          </div>
          {!isCollapsed && role === "OWNER" && (
            <Link
              href="/settings/connections"
              className="p-1.5 text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#18181B] rounded-[6px] transition-colors"
              title="Database Connections Settings"
            >
              <Settings className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
