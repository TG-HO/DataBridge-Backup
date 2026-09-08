"use client";

import { useState, useRef, useEffect } from "react";
import {
  Database,
  Send,
  Trash2,
  Copy,
  Check,
  CheckSquare,
  Square,
  ChevronDown,
  RefreshCw,
  Layers,
  Bot,
  User,
  AlertCircle,
  AlignRight,
  X,
  ArrowDown,
  Clock,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useQuerySessions, ChatMessage } from "@/lib/query-session-context";

interface DbConnectionOption {
  id: string;
  name: string;
  dbType: string;
  dbName: string;
  host: string;
  schemaContext?: string | null;
}

interface RealtimeQueryConsoleProps {
  connections: DbConnectionOption[];
  userRole?: string;
}

/**
 * Strips raw SQL queries, SQL code fences, and collapsible technical accordions
 * to guarantee that business users only see clean executive insights and tables.
 */
function stripSqlBlocks(text: string): string {
  if (!text) return "";
  let sanitized = text.replace(/<details[\s\S]*?<\/details>/gi, "");
  sanitized = sanitized.replace(/```sql[\s\S]*?```/gi, "");
  return sanitized.trim();
}

export default function RealtimeQueryConsole({ connections }: RealtimeQueryConsoleProps) {
  const {
    activeSession,
    updateActiveSessionMessages,
    updateActiveSessionConnections,
    clearActiveSessionMessages,
  } = useQuerySessions();

  // Active session messages
  const messages: ChatMessage[] = activeSession?.messages || [];

  // Multi-Database Selection
  const [selectedConnIds, setSelectedConnIds] = useState<string[]>(() => {
    if (activeSession?.selectedConnIds && activeSession.selectedConnIds.length > 0) {
      return activeSession.selectedConnIds;
    }
    return connections.length > 0 ? [connections[0].id] : [];
  });

  // Sync selected databases when active session changes
  useEffect(() => {
    if (activeSession?.selectedConnIds && activeSession.selectedConnIds.length > 0) {
      setSelectedConnIds(activeSession.selectedConnIds);
    } else if (connections.length > 0) {
      setSelectedConnIds([connections[0].id]);
    }
  }, [activeSession?.id, connections]);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat on new messages or stream chunks
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggleConnection = (id: string) => {
    const updated = selectedConnIds.includes(id)
      ? selectedConnIds.length === 1
        ? selectedConnIds
        : selectedConnIds.filter((item) => item !== id)
      : [...selectedConnIds, id];

    setSelectedConnIds(updated);
    updateActiveSessionConnections(updated);
  };

  const handleSelectAll = () => {
    const updated =
      selectedConnIds.length === connections.length
        ? [connections[0].id]
        : connections.map((c) => c.id);

    setSelectedConnIds(updated);
    updateActiveSessionConnections(updated);
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(stripSqlBlocks(text));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearHistory = () => {
    clearActiveSessionMessages();
  };

  // Scroll smoothly to a specific message by its ID
  const scrollToMessage = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-indigo-500/50", "transition-all");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-indigo-500/50");
      }, 1500);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || selectedConnIds.length === 0 || loading) return;

    const currentPrompt = prompt.trim();
    setPrompt("");
    setError(null);
    setLoading(true);

    const targetedDbs = connections
      .filter((c) => selectedConnIds.includes(c.id))
      .map((c) => ({ id: c.id, name: c.name, dbType: c.dbType.toUpperCase() }));

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // 1. Append User & Placeholder Assistant Message to Active Session
    updateActiveSessionMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: "user",
        content: currentPrompt,
        timestamp,
        targetedDatabases: targetedDbs,
      },
      {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp,
      },
    ]);

    // Format pruned chat history (only recent queries with compact content to prevent context bloat)
    const historyPayload = messages
      .filter((m) => m.id !== "welcome-message" && !m.id.startsWith("welcome-"))
      .slice(-4)
      .map((m) => ({
        role: m.role,
        content: m.role === "assistant" && m.content.length > 350
          ? m.content.substring(0, 350) + "..."
          : stripSqlBlocks(m.content),
      }));

    const clientStartTime = Date.now();
    console.log(
      "%c[DataBridge AI Console]%c Submitting query to /api/chat:",
      "background: #4f46e5; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;",
      "color: inherit;",
      currentPrompt
    );
    console.log("[DataBridge AI Console] Target Database IDs:", selectedConnIds);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: currentPrompt,
          connectionIds: selectedConnIds,
          chatHistory: historyPayload,
        }),
      });

      console.log(`[DataBridge AI Console] HTTP status ${res.status} received in ${Date.now() - clientStartTime}ms`);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with status ${res.status}`);
      }

      if (!res.body) {
        throw new Error("No response body received from server");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let accumulated = "";
      let isFirstChunk = true;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          if (isFirstChunk) {
            isFirstChunk = false;
            console.log(`[DataBridge AI Console] ⚡ First stream chunk received in ${Date.now() - clientStartTime}ms`);
          }
          const chunk = decoder.decode(value, { stream: true });
          accumulated += chunk;

          updateActiveSessionMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, content: accumulated } : msg
            )
          );
        }
      }

      console.log(`[DataBridge AI Console] ✅ Response stream completed in ${Date.now() - clientStartTime}ms (${accumulated.length} chars).`);
    } catch (err) {
      console.error(`[DataBridge AI Console] ❌ Error in chat query after ${Date.now() - clientStartTime}ms:`, err);
      const errText = err instanceof Error ? err.message : "Failed to execute query.";
      setError(errText);
      updateActiveSessionMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                content: `**Notice:** Unable to retrieve data from target database(s). ${errText}`,
              }
            : msg
        )
      );
    } finally {
      setLoading(false);
    }
  };

  if (connections.length === 0) {
    return null;
  }

  const selectedConnectionNames = connections
    .filter((c) => selectedConnIds.includes(c.id))
    .map((c) => c.name);

  // All user queries in this session for timeline navigation
  const userMessages = messages.filter((m) => m.role === "user");

  return (
    <div className="relative flex flex-col h-[760px] rounded-3xl bg-slate-900/90 border border-white/10 backdrop-blur-2xl shadow-2xl overflow-hidden">
      {/* Top Header & Controls */}
      <div className="p-4 sm:px-6 border-b border-white/10 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3 shrink-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              Database Business Analyst
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Live Console
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              {activeSession?.title || "Autonomous multi-database query synthesis"}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Database Multi-Select Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="px-3 py-1.5 rounded-xl bg-slate-950 border border-white/10 hover:border-indigo-500/40 text-xs text-slate-200 hover:text-white transition-all flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Database className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="font-medium max-w-[200px] truncate">
                {selectedConnIds.length === connections.length
                  ? `All Databases (${connections.length})`
                  : selectedConnIds.length === 1
                  ? selectedConnectionNames[0]
                  : `${selectedConnIds.length} Databases Selected`}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                  dropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 p-2 rounded-2xl bg-slate-950 border border-white/10 shadow-2xl z-50 space-y-1.5 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between px-2 py-1 border-b border-white/5 pb-2">
                  <span className="text-[11px] font-semibold text-slate-300">
                    Select Target Databases
                  </span>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                  >
                    {selectedConnIds.length === connections.length ? "Reset" : "Select All"}
                  </button>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                  {connections.map((conn) => {
                    const isSelected = selectedConnIds.includes(conn.id);
                    return (
                      <button
                        key={conn.id}
                        type="button"
                        onClick={() => handleToggleConnection(conn.id)}
                        className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-indigo-600/15 text-white border border-indigo-500/30"
                            : "hover:bg-white/5 text-slate-300 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          {isSelected ? (
                            <CheckSquare className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          )}
                          <div className="truncate">
                            <div className="font-semibold truncate">{conn.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {conn.dbName} ({conn.dbType.toUpperCase()})
                            </div>
                          </div>
                        </div>
                        <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400 border border-white/5 shrink-0">
                          {conn.dbType}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Premium Chat Menu: Access Previous Messages */}
          <button
            type="button"
            onClick={() => setChatMenuOpen(!chatMenuOpen)}
            className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
              chatMenuOpen
                ? "bg-indigo-600/25 border-indigo-500/50 text-white"
                : "bg-slate-950 border-white/10 hover:border-white/20 text-slate-300 hover:text-white"
            }`}
            title="Chat Menu - Access previous messages"
          >
            <AlignRight className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline font-medium">History</span>
            {userMessages.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono">
                {userMessages.length}
              </span>
            )}
          </button>

          {/* Clear History Button */}
          <button
            type="button"
            onClick={handleClearHistory}
            title="Clear active conversation"
            className="p-1.5 rounded-xl bg-slate-950 border border-white/10 hover:border-white/20 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Chat & Interactive Right Navigation Rail Area */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* Messages Stream Viewport */}
        <div
          ref={chatScrollContainerRef}
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pr-10 scroll-smooth"
        >
          {messages.map((msg) => {
            const isUser = msg.role === "user";
            const sanitizedContent = stripSqlBlocks(msg.content);

            return (
              <div
                id={msg.id}
                key={msg.id}
                className={`flex gap-3 max-w-4xl transition-all duration-300 rounded-2xl p-1 ${
                  isUser ? "ml-auto justify-end" : "mr-auto"
                }`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}

                <div className={`space-y-1.5 ${isUser ? "items-end" : "items-start"}`}>
                  {/* User Message Card */}
                  {isUser ? (
                    <div className="space-y-1.5">
                      <div className="p-3.5 rounded-2xl bg-indigo-600 text-white text-xs shadow-md max-w-xl leading-relaxed">
                        {msg.content}
                      </div>
                      {msg.targetedDatabases && msg.targetedDatabases.length > 0 && (
                        <div className="flex flex-wrap items-center justify-end gap-1.5 text-[10px] text-slate-400 font-mono">
                          <span className="text-slate-500">Queried:</span>
                          {msg.targetedDatabases.map((db) => (
                            <span
                              key={db.id}
                              className="px-1.5 py-0.5 rounded bg-slate-950 border border-white/10 text-indigo-300"
                            >
                              {db.name} [{db.dbType}]
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Assistant Message Card */
                    <div className="space-y-2">
                      <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/80 border border-white/10 shadow-lg text-slate-200 text-xs leading-relaxed max-w-3xl">
                        {sanitizedContent ? (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              table: ({ ...props }) => (
                                <div className="my-3 overflow-x-auto rounded-xl border border-white/15 shadow-md bg-slate-950/40">
                                  <table
                                    className="w-full text-left text-xs border-collapse font-sans"
                                    {...props}
                                  />
                                </div>
                              ),
                              thead: ({ ...props }) => (
                                <thead
                                  className="bg-slate-800/90 text-slate-200 border-b border-white/15 font-semibold"
                                  {...props}
                                />
                              ),
                              th: ({ ...props }) => (
                                <th
                                  className="px-4 py-2.5 text-[11px] font-bold tracking-wider text-indigo-200 uppercase whitespace-nowrap bg-white/[0.03]"
                                  {...props}
                                />
                              ),
                              tbody: ({ ...props }) => (
                                <tbody
                                  className="divide-y divide-white/5 bg-slate-950/60"
                                  {...props}
                                />
                              ),
                              tr: ({ ...props }) => (
                                <tr
                                  className="hover:bg-indigo-500/10 transition-colors even:bg-white/[0.02]"
                                  {...props}
                                />
                              ),
                              td: ({ ...props }) => (
                                <td
                                  className="px-4 py-2.5 text-xs text-slate-200 font-mono whitespace-nowrap"
                                  {...props}
                                />
                              ),
                              h2: ({ ...props }) => (
                                <h2
                                  className="text-sm font-bold text-white mt-1 mb-2 tracking-tight flex items-center gap-1.5"
                                  {...props}
                                />
                              ),
                              h3: ({ ...props }) => (
                                <h3
                                  className="text-xs font-bold text-indigo-300 mt-4 mb-1.5 uppercase tracking-wider"
                                  {...props}
                                />
                              ),
                              h4: ({ ...props }) => (
                                <h4
                                  className="text-xs font-bold text-indigo-300 mt-3 mb-1"
                                  {...props}
                                />
                              ),
                              p: ({ ...props }) => (
                                <p
                                  className="text-xs text-slate-300 leading-relaxed my-1.5"
                                  {...props}
                                />
                              ),
                              ul: ({ ...props }) => (
                                <ul
                                  className="list-disc list-outside pl-4 space-y-1.5 my-2 text-xs text-slate-300"
                                  {...props}
                                />
                              ),
                              li: ({ ...props }) => (
                                <li className="text-xs text-slate-300 leading-relaxed" {...props} />
                              ),
                              strong: ({ ...props }) => (
                                <strong className="font-semibold text-white" {...props} />
                              ),
                            }}
                          >
                            {sanitizedContent}
                          </ReactMarkdown>
                        ) : (
                          <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px] py-2">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                            <span>Synthesizing verified database query results...</span>
                          </div>
                        )}
                      </div>

                      {/* Assistant Metadata & Copy Action */}
                      <div className="flex items-center justify-between px-1 text-[10px] text-slate-500 font-mono">
                        <span suppressHydrationWarning>{msg.timestamp}</span>
                        {sanitizedContent && (
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(msg.id, sanitizedContent)}
                            className="flex items-center gap-1 hover:text-slate-300 transition-colors cursor-pointer"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy Summary</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-7 h-7 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-200 shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-xs px-2 py-1">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse delay-150" />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse delay-300" />
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Querying {selectedConnIds.length} target database{selectedConnIds.length > 1 ? "s" : ""}...
              </span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Right-Side Interactive Message Navigation Rail (Lines to Access Previous Messages) */}
        {messages.length > 1 && (
          <aside
            aria-label="Message Timeline"
            className="absolute right-2 top-4 bottom-4 w-6 flex flex-col items-center justify-center gap-2.5 z-20 select-none"
          >
            <div className="p-1 rounded-full bg-slate-950/80 border border-white/10 backdrop-blur-md flex flex-col items-center gap-1.5 shadow-lg">
              {messages.map((msg, index) => {
                const isUser = msg.role === "user";
                const isHovered = hoveredMsgId === msg.id;
                const snippet =
                  msg.content.length > 60 ? msg.content.substring(0, 60) + "..." : msg.content;

                return (
                  <div key={msg.id} className="relative group flex items-center">
                    <button
                      type="button"
                      onClick={() => scrollToMessage(msg.id)}
                      onMouseEnter={() => setHoveredMsgId(msg.id)}
                      onMouseLeave={() => setHoveredMsgId(null)}
                      className={`block rounded-full transition-all duration-200 cursor-pointer ${
                        isUser
                          ? "w-3 h-1 bg-indigo-400/80 hover:w-5 hover:bg-indigo-300"
                          : "w-2 h-0.5 bg-slate-500 hover:w-4 hover:bg-emerald-400"
                      } ${isHovered ? "ring-2 ring-indigo-400/50" : ""}`}
                      title={`${isUser ? "User Query" : "AI Briefing"}: ${snippet}`}
                    />

                    {/* Interactive Flyout Tooltip Preview */}
                    <div className="absolute right-6 px-2.5 py-1.5 rounded-xl bg-slate-950 border border-white/15 text-slate-200 shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-30 whitespace-nowrap min-w-[140px] max-w-xs">
                      <div className="flex items-center justify-between gap-2 pb-1 border-b border-white/5 text-[9px] font-mono text-slate-400">
                        <span className={isUser ? "text-indigo-400 font-bold" : "text-emerald-400 font-bold"}>
                          {isUser ? `Query #${index + 1}` : "Executive Brief"}
                        </span>
                        <span>{msg.timestamp}</span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-1 truncate">
                        {snippet || "Query results"}
                      </p>
                    </div>
                  </div>
                );
              })}

              {/* Quick Jump to Bottom Button */}
              <button
                type="button"
                onClick={() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="mt-1 p-0.5 rounded-full text-slate-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Jump to latest message"
              >
                <ArrowDown className="w-2.5 h-2.5" />
              </button>
            </div>
          </aside>
        )}

        {/* Premium Flyout Chat Menu (Previous Messages List) */}
        {chatMenuOpen && (
          <div className="absolute inset-y-0 right-0 w-80 bg-slate-950/95 border-l border-white/10 backdrop-blur-2xl shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlignRight className="w-4 h-4 text-indigo-400" />
                <h4 className="text-xs font-bold text-white tracking-tight">
                  Conversation Timeline
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setChatMenuOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 px-1">
                Previous Messages ({messages.length})
              </div>

              {messages.map((m, idx) => {
                const isUser = m.role === "user";
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      scrollToMessage(m.id);
                      setChatMenuOpen(false);
                    }}
                    className={`w-full p-2.5 rounded-xl text-left text-xs transition-all border cursor-pointer ${
                      isUser
                        ? "bg-indigo-600/10 hover:bg-indigo-600/20 border-indigo-500/20 text-slate-200"
                        : "bg-slate-900/40 hover:bg-slate-900 border-white/5 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1">
                      <span className={`font-semibold ${isUser ? "text-indigo-400" : "text-emerald-400"}`}>
                        {isUser ? `Query #${idx + 1}` : "Analysis"}
                      </span>
                      <span>{m.timestamp}</span>
                    </div>
                    <p className="truncate text-[11px] leading-relaxed">
                      {stripSqlBlocks(m.content) || "Database query result"}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="p-3 border-t border-white/10 bg-slate-950 flex items-center justify-between">
              <span className="text-[10px] text-slate-500 font-mono">
                Click any message to jump
              </span>
              <button
                type="button"
                onClick={() => {
                  chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
                  setChatMenuOpen(false);
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
              >
                Jump to bottom
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error Alert Bar */}
      {error && (
        <div className="px-4 py-2 bg-rose-500/10 border-t border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Bottom Modern Minimalist Chat Input Bar */}
      <div className="p-4 border-t border-white/10 bg-slate-950/70 shrink-0">
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={loading}
            placeholder={`Ask a business question against ${
              selectedConnIds.length === 1
                ? selectedConnectionNames[0] || "database"
                : `${selectedConnIds.length} selected databases`
            }... (e.g. "Who are our top 10 customers?" or "Compare sales by region")`}
            rows={2}
            className="w-full text-xs bg-slate-900 border border-white/10 rounded-2xl pl-4 pr-12 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500/80 resize-none font-sans shadow-inner transition-colors disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />

          <button
            type="submit"
            disabled={loading || !prompt.trim() || selectedConnIds.length === 0}
            className="absolute right-3 bottom-3 p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white transition-all shadow-md cursor-pointer disabled:cursor-not-allowed"
            title="Send query (Enter)"
          >
            {loading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </form>

        <div className="flex items-center justify-between mt-2 px-1 text-[10px] text-slate-500">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3 text-indigo-400" />
              <span>Target: {selectedConnIds.length} database{selectedConnIds.length > 1 ? "s" : ""}</span>
            </span>
          </div>
          <span>Press Enter to send, Shift+Enter for new line</span>
        </div>
      </div>
    </div>
  );
}
