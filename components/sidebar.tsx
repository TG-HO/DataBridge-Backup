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
      className={`relative flex flex-col h-screen border-r border-white/10 bg-[#090d16] transition-all duration-300 ease-in-out select-none z-30 shrink-0 ${
        isCollapsed ? "w-16" : "w-72"
      }`}
    >
      {/* Top Header & Brand */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-white/10">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm text-white tracking-tight">
                DataBridge <span className="text-indigo-400">AI</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                MSSQL RAG Engine
              </span>
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 mx-auto rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-600/30">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
        )}

        {/* Toggle Collapse Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
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
      <div className="p-3 border-b border-white/5 space-y-1">
        <Link
          href="/"
          className="w-full flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 text-slate-200 text-xs font-medium transition-all"
        >
          <Terminal className="w-4 h-4 text-indigo-400 shrink-0" />
          {!isCollapsed && <span>Dashboard & Query</span>}
        </Link>
        <Link
          href="/settings/connections"
          className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/[0.05] text-slate-300 hover:text-white text-xs font-medium transition-all"
        >
          <Database className="w-4 h-4 text-emerald-400 shrink-0" />
          {!isCollapsed && (
            <div className="flex items-center justify-between flex-1">
              <span>Databases</span>
              {role === "OWNER" && (
                <span className="text-[9px] font-mono text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
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
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                Query Sessions
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {displaySessions.length}
              </span>
            </div>

            <button
              onClick={() => createNewSession()}
              className="w-full flex items-center justify-center gap-2 p-2 rounded-xl bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/30 text-indigo-300 hover:text-white text-xs font-semibold transition-all shadow-sm cursor-pointer group"
              title="Start a new query session"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition-transform" />
              <span>New Query Session</span>
            </button>
          </div>
        ) : (
          <div className="flex justify-center mb-2">
            <button
              onClick={() => createNewSession()}
              className="p-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-400 hover:text-white transition-all cursor-pointer"
              title="New Query Session"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}

        {displaySessions.length === 0 ? (
          <div className="py-8 px-2 text-center text-slate-500 text-xs">
            <History className="w-5 h-5 mx-auto mb-2 text-slate-600 opacity-60" />
            {!isCollapsed && (
              <>
                <p className="font-medium text-slate-400">No Query History</p>
                <p className="text-[10px] text-slate-600 mt-1">
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
                  className={`group relative w-full flex items-center rounded-xl transition-all ${
                    isActive
                      ? "bg-indigo-600/20 text-white border border-indigo-500/40 shadow-sm"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent"
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
                        isActive ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300"
                      }`}
                    />
                    {!isCollapsed && (
                      <div className="truncate flex-1 min-w-0">
                        <p className="truncate font-medium">{s.title}</p>
                        <span className="text-[10px] text-slate-500 font-mono block">
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
                      className="opacity-0 group-hover:opacity-100 p-1.5 mr-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer"
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
      <div className="p-3 border-t border-white/10 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-300 shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col truncate">
                <span className="text-xs font-medium text-slate-200 truncate">
                  {orgName}
                </span>
                <span className="text-[10px] text-indigo-400 flex items-center gap-1 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Role: {role}
                </span>
              </div>
            )}
          </div>
          {!isCollapsed && role === "OWNER" && (
            <Link
              href="/settings/connections"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
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
