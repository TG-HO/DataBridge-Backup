"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Database,
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
  ArrowUp,
  Sparkles,
  Users,
  TrendingUp,
  Receipt,
  GitCompare,
  Paperclip,
  Globe,
  ExternalLink,
  Search,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useQuerySessions, ChatMessage, WebSource } from "@/lib/query-session-context";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import DynamicDataVisualizer, { ChartType, ChartConfig } from "@/components/dynamic-data-visualizer";
import PinWidgetModal from "@/components/pin-widget-modal";

interface ParsedVisualization {
  summary: string;
  recommendedVisualization: ChartType;
  chartConfig?: ChartConfig;
  data: Record<string, unknown>[];
  webSources?: WebSource[];
  isWebSearch?: boolean;
}

function unescapeJsonString(str: string): string {
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

/**
 * Robustly extracts clean markdown summary from complete or incomplete/streaming JSON payloads.
 * Guarantees that raw JSON syntax (braces, quotes, \n escape codes) is never displayed to the user.
 */
function extractSummaryFromRaw(content: string): string {
  if (!content) return "";
  const trimmed = content.trim();

  // If already pure markdown text (not JSON)
  if (!trimmed.startsWith("{") && !trimmed.includes('"summary"')) {
    return trimmed;
  }

  // 1. Direct JSON parse
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed.summary === "string" && parsed.summary.trim()) {
      return parsed.summary;
    }
  } catch {}

  // 2. Extract closed summary: "summary": "..."
  const closedMatch = trimmed.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (closedMatch && closedMatch[1]) {
    return unescapeJsonString(closedMatch[1]);
  }

  // 3. Extract unclosed / streaming summary: "summary": " ...
  const partialMatch = trimmed.match(/"summary"\s*:\s*"([\s\S]*)/);
  if (partialMatch && partialMatch[1]) {
    let raw = partialMatch[1];
    const nextKeyIndex = raw.search(/",\s*"[a-zA-Z0-9_-]+"\s*:/);
    if (nextKeyIndex !== -1) {
      raw = raw.substring(0, nextKeyIndex);
    }
    return unescapeJsonString(raw);
  }

  return trimmed;
}

/**
 * Transforms inline citation text like [Source 1: domain.com] or [Source 1]
 * into beautifully styled interactive badge pills.
 */
function renderContentWithCitationPills(text: string) {
  if (!text || typeof text !== "string") return text;
  const parts = text.split(/(\[Source\s+\d+(?::\s*[^\]]+)?\])/g);
  if (parts.length === 1) return text;

  return parts.map((part, idx) => {
    const match = part.match(/^\[Source\s+(\d+)(?::\s*([^\]]+))?\]$/);
    if (match) {
      const sourceNum = match[1];
      const domain = match[2]?.trim() || "";
      return (
        <span
          key={idx}
          className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded-[4px] bg-[#00E599]/15 border border-[#00E599]/35 text-[#00E599] text-[11px] font-mono font-semibold tracking-tight hover:bg-[#00E599]/25 transition-colors cursor-default align-baseline shadow-xs"
          title={domain ? `Verified Source #${sourceNum}: ${domain}` : `Verified Source #${sourceNum}`}
        >
          <Globe className="w-2.5 h-2.5 shrink-0 text-[#00E599]" />
          <span>Source {sourceNum}{domain ? `: ${domain}` : ""}</span>
        </span>
      );
    }
    return part;
  });
}

function parseVisualizationPayload(content: string): ParsedVisualization | null {
  if (!content) return null;
  const trimmed = content.trim();

  // 1. Direct JSON parse attempt
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && typeof parsed.summary === "string") {
      return {
        summary: parsed.summary,
        recommendedVisualization: parsed.recommendedVisualization || "TABLE",
        chartConfig: parsed.chartConfig,
        data: Array.isArray(parsed.data) ? parsed.data : [],
        webSources: Array.isArray(parsed.webSources) ? parsed.webSources : undefined,
        isWebSearch: Boolean(parsed.isWebSearch),
      };
    }
  } catch { }

  // 2. Extract from markdown code fences or JSON boundary
  const jsonMatch =
    trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ||
    trimmed.match(/(\{[\s\S]*"summary"[\s\S]*\})/);

  if (jsonMatch) {
    try {
      const candidate = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      if (candidate && typeof candidate === "object" && typeof candidate.summary === "string") {
        return {
          summary: candidate.summary,
          recommendedVisualization: candidate.recommendedVisualization || "TABLE",
          chartConfig: candidate.chartConfig,
          data: Array.isArray(candidate.data) ? candidate.data : [],
          webSources: Array.isArray(candidate.webSources) ? candidate.webSources : undefined,
          isWebSearch: Boolean(candidate.isWebSearch),
        };
      }
    } catch { }
  }

  // 3. Resilient fallback for partial/streaming or unclosed JSON
  if (trimmed.includes('"summary"')) {
    const summaryText = extractSummaryFromRaw(trimmed);
    if (summaryText && summaryText !== trimmed) {
      let webSources: WebSource[] | undefined = undefined;
      const webSourcesMatch = trimmed.match(/"webSources"\s*:\s*(\[[^\]]*\])/);
      if (webSourcesMatch) {
        try { webSources = JSON.parse(webSourcesMatch[1]); } catch {}
      }

      let dataRows: Record<string, unknown>[] = [];
      const dataMatch = trimmed.match(/"data"\s*:\s*(\[[^\]]*\])/);
      if (dataMatch) {
        try { dataRows = JSON.parse(dataMatch[1]); } catch {}
      }

      return {
        summary: summaryText,
        recommendedVisualization: "TABLE",
        data: dataRows,
        webSources,
        isWebSearch: true,
      };
    }
  }

  return null;
}

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

interface AutoResizeProps {
  minHeight: number;
  maxHeight?: number;
}

function useAutoResizeTextarea({ minHeight, maxHeight }: AutoResizeProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`;
      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Infinity)
      );
      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight]
  );

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.style.height = `${minHeight}px`;
  }, [minHeight]);

  return { textareaRef, adjustHeight };
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
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pin Widget Modal state (FR-12)
  const [pinTargetWidget, setPinTargetWidget] = useState<{
    title: string;
    chartType: string;
    chartConfig: any;
    rawQuery?: string;
    connectionId?: string;
    data?: any[];
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 48,
    maxHeight: 160,
  });

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

  const handleQuickPrompt = (quickText: string) => {
    setPrompt(quickText);
    if (textareaRef.current) {
      textareaRef.current.focus();
      setTimeout(() => adjustHeight(), 50);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || (!enableWebSearch && selectedConnIds.length === 0) || loading) return;

    const currentPrompt = prompt.trim();
    setPrompt("");
    adjustHeight(true);
    setError(null);
    setLoading(true);

    const targetedDbs = connections
      .filter((c) => selectedConnIds.includes(c.id))
      .map((c) => ({ id: c.id, name: c.name, dbType: c.dbType.toUpperCase() }));

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;
    setActiveAssistantId(assistantMsgId);
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // 1. Append User & Placeholder Assistant Message
    updateActiveSessionMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: "user",
        content: currentPrompt,
        timestamp,
        targetedDatabases: targetedDbs,
        isWebSearch: enableWebSearch,
      },
      {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp,
        isWebSearch: enableWebSearch,
      },
    ]);

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
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort("Query timed out after 120 seconds");
    }, 120000);

    console.log(
      "%c[DataBridge AI Console]%c Submitting query to /api/chat:",
      "background: #4f46e5; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;",
      "color: inherit;",
      currentPrompt,
      `[WebSearch: ${enableWebSearch}]`
    );

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: currentPrompt,
          connectionIds: selectedConnIds,
          chatHistory: historyPayload,
          enableWebSearch,
        }),
        signal: abortController.signal,
      });

      console.log(`[DataBridge AI Console] HTTP status ${res.status} received in ${Date.now() - clientStartTime}ms`);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || `Server responded with status ${res.status}`);
      }

      if (!res.body) {
        throw new Error("No response stream received from the server");
      }

      const isDbQueried = res.headers.get("X-DB-Queried") === "true";
      const connectionIdHeader = isDbQueried ? (res.headers.get("X-Connection-Id") || "") : "";
      const rawQueryHeader = isDbQueried && res.headers.get("X-Raw-Query")
        ? decodeURIComponent(res.headers.get("X-Raw-Query")!)
        : "";
      const isWebSearchHeader = res.headers.get("X-Web-Search") === "true";

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
            prev.map((msg) => {
              if (msg.id === assistantMsgId) {
                return {
                  ...msg,
                  content: accumulated,
                  connectionId: connectionIdHeader,
                  rawQuery: rawQueryHeader,
                  isWebSearch: enableWebSearch || isWebSearchHeader,
                  isDbQueried: isDbQueried,
                  isError: false,
                };
              }
              if (msg.id === userMsgId && !isDbQueried) {
                return {
                  ...msg,
                  targetedDatabases: [],
                  isDbQueried: false,
                };
              }
              return msg;
            })
          );
        }
      }

      clearTimeout(timeoutId);

      if (!accumulated.trim()) {
        throw new Error(
          "The database engine executed the query, but the synthesis service returned an empty response. This can happen if the AI model is temporarily rate-limited. Please retry."
        );
      }

      // Check for structured web sources in completed stream
      const finalParsed = parseVisualizationPayload(accumulated);
      if (finalParsed?.webSources && finalParsed.webSources.length > 0) {
        updateActiveSessionMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                ...msg,
                webSources: finalParsed.webSources,
                isWebSearch: true,
              }
              : msg
          )
        );
      }

      console.log(`[DataBridge AI Console] ✅ Response stream completed in ${Date.now() - clientStartTime}ms (${accumulated.length} chars).`);
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isAbort = err === "Query timed out after 120 seconds" || (err instanceof Error && err.name === "AbortError");
      const errText = isAbort
        ? "The query request timed out after 120 seconds. The database query or AI synthesis took too long to complete."
        : err instanceof Error
          ? err.message
          : "Failed to execute query.";

      console.error(`[DataBridge AI Console] ❌ Error in chat query after ${Date.now() - clientStartTime}ms:`, err);
      setError(errText);

      updateActiveSessionMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
              ...msg,
              content: `⚠️ **Query Processing Notice**\n\n${errText}\n\n*Suggestion:* Check your database connection status or click **Retry Query** below.`,
              isError: true,
              errorMessage: errText,
            }
            : msg
        )
      );
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
      setActiveAssistantId(null);
    }
  };

  if (connections.length === 0) {
    return null;
  }

  const selectedConnectionNames = connections
    .filter((c) => selectedConnIds.includes(c.id))
    .map((c) => c.name);

  const userMessages = messages.filter((m) => m.role === "user");
  const hasUserQueries = userMessages.length > 0;

  return (
    <div
      className="relative w-full h-full flex flex-col overflow-hidden bg-cover bg-center"
      style={{
        backgroundImage:
          "url('https://cdn.21st.dev/assets/mirror/c3/c333918af688a4a8a3d004652e6c0ee219457a9d84d380eeb31f513d4b59a09f.png')",
        backgroundAttachment: "fixed",
      }}
    >
      {/* Dark Cosmos Overlay for Contrast & Readability */}
      <div className="absolute inset-0 bg-[#09090B]/90 backdrop-blur-[1px] pointer-events-none" />

      {/* Top Header & Controls */}
      <div className="relative z-20 px-4 sm:px-6 py-3 border-b border-white/[0.08] bg-[#121215]/90 backdrop-blur-xl flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[6px] bg-gradient-to-tr from-[#00E599] to-[#10B981] flex items-center justify-center text-[#09090B] shadow-sm">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#FAFAFA] tracking-tight flex items-center gap-2">
              <span>DataBridge AI</span>
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-[4px] bg-[#00E599]/15 text-[#00E599] border border-[#00E599]/30">
                Console
              </span>
            </h3>
            <p className="text-[11px] text-[#A1A1AA] truncate max-w-sm font-mono">
              {activeSession?.title || "Multi-database natural language query engine"}
            </p>
          </div>
        </div>

        {/* Header Action Controls */}
        <div className="flex items-center gap-2">
          {/* Target Database Multi-Select Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="px-3 py-1.5 rounded-[6px] bg-[#18181B] border border-white/[0.08] hover:border-[#00E599]/50 text-xs text-[#FAFAFA] transition-all flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Database className="w-3.5 h-3.5 text-[#00E599] shrink-0" />
              <span className="font-medium max-w-[190px] truncate">
                {selectedConnIds.length === connections.length
                  ? `All Databases (${connections.length})`
                  : selectedConnIds.length === 1
                    ? selectedConnectionNames[0]
                    : `${selectedConnIds.length} Databases Selected`}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-[#A1A1AA] transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""
                  }`}
              />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 p-2 rounded-[10px] bg-[#18181B] border border-white/[0.08] shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)] z-50 space-y-1.5 animate-in fade-in zoom-in-95 duration-100 backdrop-blur-2xl">
                <div className="flex items-center justify-between px-2 py-1 border-b border-white/[0.08] pb-2">
                  <span className="text-[11px] font-semibold text-[#FAFAFA]">
                    Select Target Databases
                  </span>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-[10px] text-[#00E599] hover:text-[#00E599]/80 font-mono transition-colors cursor-pointer"
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
                        className={`w-full flex items-center justify-between p-2 rounded-[6px] text-left text-xs transition-colors cursor-pointer ${isSelected
                          ? "bg-white/[0.08] text-[#FAFAFA] border border-[#00E599]/40 shadow-sm"
                          : "hover:bg-white/[0.04] text-[#A1A1AA] border border-transparent"
                          }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          {isSelected ? (
                            <CheckSquare className="w-3.5 h-3.5 text-[#00E599] shrink-0" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-[#A1A1AA] shrink-0" />
                          )}
                          <div className="truncate">
                            <div className="font-semibold truncate text-[#FAFAFA]">{conn.name}</div>
                            <div className="text-[10px] text-[#A1A1AA] font-mono">
                              {conn.dbName} ({conn.dbType.toUpperCase()})
                            </div>
                          </div>
                        </div>
                        <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded-[4px] bg-[#121215] text-[#A1A1AA] border border-white/[0.08] shrink-0">
                          {conn.dbType}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* History / Chat Menu */}
          <button
            type="button"
            onClick={() => setChatMenuOpen(!chatMenuOpen)}
            className={`px-3 py-1.5 rounded-[6px] border text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${chatMenuOpen
              ? "bg-[#18181B] border-[#00E599]/50 text-[#FAFAFA]"
              : "bg-[#18181B] border-white/[0.08] hover:border-white/[0.15] text-[#A1A1AA] hover:text-[#FAFAFA]"
              }`}
            title="Conversation Timeline & History"
          >
            <AlignRight className="w-3.5 h-3.5 text-[#00E599]" />
            <span className="hidden sm:inline font-medium">History</span>
            {userMessages.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-[4px] bg-[#00E599]/15 text-[#00E599] text-[10px] font-mono">
                {userMessages.length}
              </span>
            )}
          </button>

          {/* Clear Session Button */}
          <button
            type="button"
            onClick={handleClearHistory}
            title="Clear active conversation"
            className="p-1.5 rounded-[6px] bg-[#18181B] border border-white/[0.08] hover:border-rose-500/30 text-[#A1A1AA] hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Conversation Stream Viewport */}
      <div className="relative z-10 flex-1 flex overflow-hidden">
        <div
          ref={chatScrollContainerRef}
          className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 pr-10 scroll-smooth"
        >
          {/* Centered Hero Display when No User Messages */}
          {!hasUserQueries && (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
              <div className="flex items-center justify-center mb-4 animate-in zoom-in-90 duration-300">
                <Image
                  src="/db-logo-only-light.png"
                  alt="DataBridge AI"
                  width={72}
                  height={72}
                  className="h-16 w-auto object-contain drop-shadow-[0_8px_24px_rgba(0,229,153,0.35)]"
                  priority
                  unoptimized
                />
              </div>
              <h1 className="text-3xl sm:text-5xl font-extrabold text-[#FAFAFA] tracking-tight">
                DataBridge <span className="text-[#00E599]">AI</span>
              </h1>
              <p className="mt-3 text-sm text-[#A1A1AA] max-w-md mx-auto leading-relaxed">
                Autonomous multi-database business intelligence. Ask any operational question in natural language below.
              </p>

              {/* Enterprise Quick Action Chips */}
              <div className="flex items-center justify-center flex-wrap gap-2.5 max-w-2xl mt-8">
                <QuickActionChip
                  icon={<Globe className="w-3.5 h-3.5 text-[#00E599]" />}
                  label="Competitor Analysis: Fuel Retail"
                  onClick={() => {
                    setEnableWebSearch(true);
                    handleQuickPrompt("Competitor analysis of top retail fuel operators and market share positioning.");
                  }}
                />
                <QuickActionChip
                  icon={<Search className="w-3.5 h-3.5 text-[#0EA5E9]" />}
                  label="Market Price Benchmarks"
                  onClick={() => {
                    setEnableWebSearch(true);
                    handleQuickPrompt("Analyze current oil and fuel market trends compared to industry competitors.");
                  }}
                />
                <QuickActionChip
                  icon={<Users className="w-3.5 h-3.5 text-[#00E599]" />}
                  label="Top 10 Customers"
                  onClick={() => handleQuickPrompt("List our top 10 customers by order volume with their status.")}
                />
                <QuickActionChip
                  icon={<TrendingUp className="w-3.5 h-3.5 text-[#10B981]" />}
                  label="Sales Breakdown"
                  onClick={() => handleQuickPrompt("Compare sales revenue breakdown across all connected businesses.")}
                />
                <QuickActionChip
                  icon={<Receipt className="w-3.5 h-3.5 text-[#F59E0B]" />}
                  label="Recent Invoices & Orders"
                  onClick={() => handleQuickPrompt("Show our most recent high-value orders and outstanding balances.")}
                />
                <QuickActionChip
                  icon={<GitCompare className="w-3.5 h-3.5 text-[#0EA5E9]" />}
                  label="Cross-DB Reconciliation"
                  onClick={() => handleQuickPrompt("Synthesize customer overlap and transaction standing across connected databases.")}
                />
              </div>
            </div>
          )}

          {/* Rendered Conversation Messages */}
          {hasUserQueries &&
            messages.map((msg, index) => {
              const isUser = msg.role === "user";
              const sanitizedContent = stripSqlBlocks(msg.content);

              return (
                <div
                  id={msg.id}
                  key={msg.id}
                  className={`flex gap-3 max-w-5xl transition-all duration-300 rounded-[10px] p-1 ${isUser ? "ml-auto justify-end" : "mr-auto"
                    }`}
                >
                  {!isUser && (
                    <div className="w-8 h-8 rounded-[6px] bg-[#18181B] border border-white/[0.08] flex items-center justify-center text-[#00E599] shrink-0 mt-0.5 shadow-sm">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`space-y-1.5 ${isUser ? "items-end" : "items-start"}`}>
                    {/* User Card */}
                    {isUser ? (
                      <div className="space-y-1.5">
                        <div className="p-4 rounded-[10px] bg-[#18181B] text-[#FAFAFA] text-xs shadow-sm max-w-xl leading-relaxed border border-white/[0.08]">
                          {msg.content}
                        </div>
                        {msg.targetedDatabases && msg.targetedDatabases.length > 0 ? (
                          <div className="flex flex-wrap items-center justify-end gap-1.5 text-[10px] text-[#A1A1AA] font-mono">
                            <span className="text-[#A1A1AA]/60">Queried:</span>
                            {msg.targetedDatabases.map((db) => (
                              <span
                                key={db.id}
                                className="px-1.5 py-0.5 rounded-[4px] bg-[#121215] border border-white/[0.08] text-[#00E599]"
                              >
                                {db.name} [{db.dbType}]
                              </span>
                            ))}
                          </div>
                        ) : msg.isWebSearch ? (
                          <div className="flex flex-wrap items-center justify-end gap-1.5 text-[10px] font-mono">
                            <span className="text-[#A1A1AA]/60">Mode:</span>
                            <span className="px-1.5 py-0.5 rounded-[4px] bg-[#00E599]/15 border border-[#00E599]/30 text-[#00E599] font-medium flex items-center gap-1">
                              <Globe className="w-2.5 h-2.5 text-[#00E599]" />
                              Live Web Intelligence
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      /* Assistant Card */
                      <div className="space-y-3 max-w-3xl">
                        {(() => {
                          const isErrorMessage = Boolean(
                            msg.isError ||
                            (sanitizedContent && (
                              sanitizedContent.startsWith("⚠️") ||
                              sanitizedContent.startsWith("**Notice:**") ||
                              sanitizedContent.toLowerCase().startsWith("error:") ||
                              sanitizedContent.toLowerCase().includes("unable to retrieve data from target database")
                            ))
                          );

                          if (isErrorMessage) {
                            return (
                              <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-b from-rose-950/40 to-black/85 border border-rose-500/30 shadow-2xl backdrop-blur-xl text-neutral-200">
                                <div className="flex items-start gap-3.5">
                                  <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0 mt-0.5 shadow-lg shadow-rose-950/50">
                                    <AlertCircle className="w-4 h-4" />
                                  </div>
                                  <div className="space-y-2.5 flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <h4 className="text-xs font-bold text-rose-300 uppercase tracking-wider font-mono">
                                        Query Processing Notice
                                      </h4>
                                      <span className="text-[9px] font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                                        Needs Attention
                                      </span>
                                    </div>

                                    <div className="text-xs text-neutral-300 leading-relaxed font-sans prose prose-invert max-w-none">
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {sanitizedContent || msg.errorMessage || "The query encountered an unexpected issue while executing or synthesizing database records."}
                                      </ReactMarkdown>
                                    </div>

                                    <div className="pt-2 flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const prevUserMsg = messages
                                            .slice(0, index)
                                            .reverse()
                                            .find((m: ChatMessage) => m.role === "user");
                                          if (prevUserMsg) {
                                            handleQuickPrompt(prevUserMsg.content);
                                          }
                                        }}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 hover:text-white text-xs font-medium transition-all shadow-sm cursor-pointer"
                                      >
                                        <RefreshCw className="w-3.5 h-3.5" />
                                        <span>Retry Query</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          const parsedViz = parseVisualizationPayload(sanitizedContent);
                          const rawExtractedSummary = extractSummaryFromRaw(sanitizedContent);
                          const summaryToRender = parsedViz?.summary || rawExtractedSummary || sanitizedContent;
                          const webSources = parsedViz?.webSources || msg.webSources || [];
                          const isWebQuery = Boolean(msg.isWebSearch || parsedViz?.isWebSearch || webSources.length > 0);

                          if (summaryToRender && summaryToRender.trim().length > 0) {
                            return (
                              <div className="space-y-4">
                                {/* Source Badges */}
                                <div className="flex flex-wrap items-center gap-2">
                                  {isWebQuery && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#00E599]/15 border border-[#00E599]/35 text-[#00E599] text-[11px] font-mono font-semibold shadow-sm">
                                      <Globe className="w-3 h-3 text-[#00E599] animate-pulse" />
                                      <span>Live Web Intelligence</span>
                                    </span>
                                  )}
                                  {msg.isDbQueried !== false && Boolean(msg.connectionId) && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#0EA5E9]/15 border border-[#0EA5E9]/35 text-[#0EA5E9] text-[11px] font-mono font-semibold shadow-sm">
                                      <Database className="w-3 h-3 text-[#0EA5E9]" />
                                      <span>Internal Database</span>
                                    </span>
                                  )}
                                </div>

                                {/* Executive Summary Markdown Card */}
                                <div className="p-5 sm:p-6 rounded-[12px] bg-[#121215] border border-white/[0.08] shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)] text-[#FAFAFA] text-xs leading-relaxed backdrop-blur-xl">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                      table: ({ ...props }) => (
                                        <div className="my-4 overflow-x-auto rounded-[8px] border border-white/[0.08] shadow-inner bg-[#09090B]">
                                          <table className="w-full text-left text-xs border-collapse font-sans" {...props} />
                                        </div>
                                      ),
                                      thead: ({ ...props }) => (
                                        <thead className="bg-[#18181B] text-[#FAFAFA] border-b border-white/[0.08] font-semibold" {...props} />
                                      ),
                                      th: ({ ...props }) => (
                                        <th className="px-4 py-2.5 text-[10px] font-bold tracking-wider text-[#00E599] uppercase whitespace-nowrap font-mono" {...props} />
                                      ),
                                      tbody: ({ ...props }) => (
                                        <tbody className="divide-y divide-white/[0.04]" {...props} />
                                      ),
                                      tr: ({ ...props }) => (
                                        <tr className="hover:bg-white/[0.03] transition-colors" {...props} />
                                      ),
                                      td: ({ ...props }) => (
                                        <td className="px-4 py-2.5 text-xs text-[#FAFAFA] font-mono whitespace-nowrap" {...props} />
                                      ),
                                      h2: ({ ...props }) => (
                                        <h2 className="text-base sm:text-lg font-bold text-white mt-3 mb-2.5 tracking-tight flex items-center gap-2 pb-1.5 border-b border-white/[0.08]" {...props} />
                                      ),
                                      h3: ({ children, ...props }) => (
                                        <h3 className="text-xs font-bold text-[#00E599] mt-5 mb-2 uppercase tracking-wider font-mono flex items-center gap-2" {...props}>
                                          <span className="w-1.5 h-1.5 rounded-full bg-[#00E599] shrink-0" />
                                          <span>{children}</span>
                                        </h3>
                                      ),
                                      h4: ({ ...props }) => (
                                        <h4 className="text-xs font-semibold text-white/90 mt-3.5 mb-1" {...props} />
                                      ),
                                      p: ({ children }) => (
                                        <p className="text-[13px] text-[#D4D4D8] leading-relaxed my-2.5">
                                          {Array.isArray(children)
                                            ? children.map((c, i) => (typeof c === "string" ? renderContentWithCitationPills(c) : c))
                                            : typeof children === "string"
                                            ? renderContentWithCitationPills(children)
                                            : children}
                                        </p>
                                      ),
                                      ul: ({ ...props }) => (
                                        <ul className="space-y-2 my-2.5 pl-1 list-none" {...props} />
                                      ),
                                      li: ({ children }) => (
                                        <li className="text-[13px] text-[#D4D4D8] leading-relaxed flex items-start gap-2.5 my-1.5">
                                          <span className="w-1.5 h-1.5 rounded-full bg-[#00E599] shrink-0 mt-2" />
                                          <span className="flex-1">
                                            {Array.isArray(children)
                                              ? children.map((c, i) => (typeof c === "string" ? renderContentWithCitationPills(c) : c))
                                              : typeof children === "string"
                                              ? renderContentWithCitationPills(children)
                                              : children}
                                          </span>
                                        </li>
                                      ),
                                      strong: ({ ...props }) => (
                                        <strong className="font-semibold text-white" {...props} />
                                      ),
                                    }}
                                  >
                                    {summaryToRender}
                                  </ReactMarkdown>

                                  {/* Verified Web Sources & Citations Grid */}
                                  {webSources.length > 0 && (
                                    <div className="mt-6 pt-5 border-t border-white/[0.08] space-y-3">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#FAFAFA]">
                                          <Globe className="w-3.5 h-3.5 text-[#00E599]" />
                                          <span>Verified Web Sources & Citations ({webSources.length})</span>
                                        </div>
                                        <span className="text-[10px] text-[#A1A1AA] font-mono">Live Intelligence</span>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        {webSources.map((src, i) => (
                                          <a
                                            key={i}
                                            href={src.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="group flex flex-col p-3 rounded-[8px] bg-[#18181B] hover:bg-[#202024] border border-white/[0.06] hover:border-[#00E599]/40 transition-all text-left shadow-sm"
                                          >
                                            <div className="flex items-center justify-between gap-1 mb-1.5">
                                              <span className="text-[10px] font-mono text-[#00E599] uppercase tracking-wider truncate max-w-[170px] font-bold">
                                                [Source {i + 1}] {src.domain || "Web Source"}
                                              </span>
                                              <ExternalLink className="w-3 h-3 text-[#A1A1AA] group-hover:text-[#00E599] transition-colors shrink-0" />
                                            </div>
                                            <span className="text-xs font-semibold text-[#FAFAFA] group-hover:text-[#00E599] transition-colors line-clamp-2 leading-snug">
                                              {src.title}
                                            </span>
                                            {src.snippet && (
                                              <p className="text-[11px] text-[#A1A1AA] mt-1.5 line-clamp-3 leading-relaxed">
                                                {src.snippet}
                                              </p>
                                            )}
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Dynamic Auto-Visualization (FR-11, FR-12, FR-13) */}
                                {parsedViz?.data && parsedViz.data.length > 0 && (
                                  <DynamicDataVisualizer
                                    recommendedVisualization={parsedViz.recommendedVisualization}
                                    chartConfig={parsedViz.chartConfig}
                                    data={parsedViz.data}
                                    summary={summaryToRender}
                                    rawQuery={msg.rawQuery}
                                    connectionId={msg.connectionId || ""}
                                    onPin={() =>
                                      setPinTargetWidget({
                                        title: parsedViz.chartConfig?.title || "Analytics Visualization",
                                        chartType: parsedViz.recommendedVisualization,
                                        chartConfig: parsedViz.chartConfig || {},
                                        rawQuery: msg.rawQuery || "",
                                        connectionId: msg.connectionId || "",
                                        data: parsedViz.data,
                                      })
                                    }
                                  />
                                )}
                              </div>
                            );
                          }

                          // Only render the spinner if we are actively generating for THIS message
                          if (loading && msg.id === activeAssistantId) {
                            return (
                              <div className="p-5 rounded-[10px] bg-[#121215] border border-white/[0.08] shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)]">
                                <div className="flex items-center gap-2.5 text-[#A1A1AA] font-mono text-xs py-1">
                                  <RefreshCw className="w-4 h-4 animate-spin text-[#00E599]" />
                                  <span>Synthesizing verified query results & auto-visualization...</span>
                                </div>
                              </div>
                            );
                          }

                          // If request finished/stopped and there is no content, render a graceful notice
                          return (
                            <div className="p-5 sm:p-6 rounded-[10px] bg-[#121215] border border-[#F59E0B]/30 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)] text-[#FAFAFA]">
                              <div className="flex items-start gap-3.5">
                                <div className="w-8 h-8 rounded-[6px] bg-[#F59E0B]/20 border border-[#F59E0B]/40 flex items-center justify-center text-[#F59E0B] shrink-0 mt-0.5">
                                  <AlertCircle className="w-4 h-4" />
                                </div>
                                <div className="space-y-2.5 flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <h4 className="text-xs font-bold text-[#F59E0B] uppercase tracking-wider font-mono">
                                      Query Synthesis Interrupted
                                    </h4>
                                    <span className="text-[9px] font-mono text-[#F59E0B] bg-[#F59E0B]/10 px-2 py-0.5 rounded-[4px] border border-[#F59E0B]/20">
                                      No Response
                                    </span>
                                  </div>
                                  <p className="text-xs text-[#A1A1AA] leading-relaxed">
                                    No response was returned for this query. The upstream AI provider may be temporarily rate-limited or the network stream ended prematurely.
                                  </p>
                                  <div className="pt-2 flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const prevUserMsg = messages
                                          .slice(0, index)
                                          .reverse()
                                          .find((m: ChatMessage) => m.role === "user");
                                        if (prevUserMsg) {
                                          handleQuickPrompt(prevUserMsg.content);
                                        }
                                      }}
                                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[6px] bg-[#F59E0B]/15 hover:bg-[#F59E0B]/25 border border-[#F59E0B]/30 text-[#F59E0B] hover:text-white text-xs font-medium transition-all shadow-sm cursor-pointer"
                                    >
                                      <RefreshCw className="w-3.5 h-3.5" />
                                      <span>Retry Query</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Assistant Actions */}
                        <div className="flex items-center justify-between px-1 text-[10px] text-[#A1A1AA] font-mono">
                          <span suppressHydrationWarning>{msg.timestamp}</span>
                          {sanitizedContent && (
                            <button
                              type="button"
                              onClick={() => handleCopyMessage(msg.id, sanitizedContent)}
                              className="flex items-center gap-1 hover:text-[#FAFAFA] transition-colors cursor-pointer"
                            >
                              {copiedId === msg.id ? (
                                <>
                                  <Check className="w-3 h-3 text-[#00E599]" />
                                  <span className="text-[#00E599]">Copied</span>
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
                    <div className="w-8 h-8 rounded-[6px] bg-[#18181B] border border-white/[0.08] flex items-center justify-center text-[#00E599] shrink-0 mt-0.5 shadow-sm">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex items-center gap-2 text-[#A1A1AA] text-xs px-2 py-1">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00E599] animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#00E599] animate-pulse delay-150" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#00E599] animate-pulse delay-300" />
              </div>
              <span className="text-xs font-mono text-[#A1A1AA]">
                Querying {selectedConnIds.length} database{selectedConnIds.length > 1 ? "s" : ""}...
              </span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Right-Side Interactive Message Navigation Rail (Lines) */}
        {messages.length > 1 && (
          <aside
            aria-label="Message Timeline"
            className="absolute right-2 top-4 bottom-4 w-6 flex flex-col items-center justify-center gap-2.5 z-20 select-none"
          >
            <div className="p-1.5 rounded-full bg-black/80 border border-white/15 backdrop-blur-xl flex flex-col items-center gap-2 shadow-2xl">
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
                      className={`block rounded-full transition-all duration-200 cursor-pointer ${isUser
                        ? "w-3 h-1 bg-[#0EA5E9] hover:w-5 hover:bg-[#0EA5E9]/80"
                        : "w-2 h-0.5 bg-neutral-600 hover:w-4 hover:bg-[#00E599]"
                        } ${isHovered ? "ring-2 ring-[#00E599]/50" : ""}`}
                      title={`${isUser ? "User Query" : "AI Briefing"}: ${snippet}`}
                    />

                    {/* Tooltip Preview */}
                    <div className="absolute right-7 px-3 py-1.5 rounded-[6px] bg-[#121215] border border-[rgba(255,255,255,0.08)] text-[#FAFAFA] shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-30 whitespace-nowrap min-w-[150px] max-w-xs backdrop-blur-xl">
                      <div className="flex items-center justify-between gap-2 pb-1 border-b border-[rgba(255,255,255,0.08)] text-[9px] font-mono text-[#A1A1AA]">
                        <span className={isUser ? "text-[#0EA5E9] font-bold" : "text-[#00E599] font-bold"}>
                          {isUser ? `Query #${index + 1}` : "Executive Brief"}
                        </span>
                        <span>{msg.timestamp}</span>
                      </div>
                      <p className="text-[11px] text-neutral-300 mt-1 truncate">
                        {snippet || "Query results"}
                      </p>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="mt-1 p-0.5 rounded-full text-neutral-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Jump to latest message"
              >
                <ArrowDown className="w-2.5 h-2.5" />
              </button>
            </div>
          </aside>
        )}

        {/* Previous Messages Flyout Menu */}
        {chatMenuOpen && (
          <div className="absolute inset-y-0 right-0 w-80 bg-black/95 border-l border-white/15 backdrop-blur-2xl shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200">
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
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className="text-[10px] uppercase font-mono tracking-wider text-neutral-500 px-1">
                Previous Queries ({messages.length})
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
                    className={`w-full p-2.5 rounded-[6px] text-left text-xs transition-all border cursor-pointer ${isUser
                      ? "bg-[#00E599]/10 hover:bg-[#00E599]/20 border-[#00E599]/30 text-[#FAFAFA]"
                      : "bg-[#18181B] hover:bg-[#27272A] border-[rgba(255,255,255,0.08)] text-[#A1A1AA] hover:text-[#FAFAFA]"
                      }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#71717A] mb-1">
                      <span className={`font-semibold ${isUser ? "text-[#00E599]" : "text-[#10B981]"}`}>
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

            <div className="p-3 border-t border-white/[0.08] bg-[#121215] flex items-center justify-between">
              <span className="text-[10px] text-[#A1A1AA] font-mono">
                Click any query to jump
              </span>
              <button
                type="button"
                onClick={() => {
                  chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
                  setChatMenuOpen(false);
                }}
                className="text-xs text-[#00E599] hover:text-[#00E599]/80 font-mono font-medium cursor-pointer"
              >
                Jump to bottom
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error Alert Bar */}
      {error && (
        <div className="relative z-20 px-4 py-2 bg-rose-500/15 border-t border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Floating Modern Fintech Input Box Section */}
      <div className="relative z-20 w-full max-w-4xl mx-auto px-4 pb-4 sm:pb-6">
        <div className={cn(
          "relative bg-[#121215] rounded-[10px] border shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)] transition-all",
          enableWebSearch
            ? "border-[#00E599]/40 shadow-[0_0_24px_-4px_rgba(0,229,153,0.15)] focus-within:border-[#00E599] focus-within:ring-1 focus-within:ring-[#00E599]/40"
            : "border-white/[0.08] focus-within:border-[#00E599]/50 focus-within:ring-1 focus-within:ring-[#00E599]/30"
        )}>
          <Textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              adjustHeight();
            }}
            placeholder={
              enableWebSearch
                ? "Search the web for competitor analysis, market benchmarks, pricing trends, or compare with internal data..."
                : `Ask anything across ${selectedConnIds.length === 1
                  ? selectedConnectionNames[0] || "database"
                  : `${selectedConnIds.length} connected databases`
                  }... (e.g. "Who are our top customers?" or "Compare sales by region")`
            }
            className={cn(
              "w-full px-4 py-3 resize-none border-none",
              "bg-transparent text-[#FAFAFA] text-xs sm:text-sm",
              "focus-visible:ring-0 focus-visible:ring-offset-0",
              "placeholder:text-[#A1A1AA] min-h-[50px]"
            )}
            style={{ overflow: "hidden" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />

          {/* Footer Buttons Bar */}
          <div className="flex items-center justify-between p-3 border-t border-white/[0.08]">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={() => setDropdownOpen(true)}
                className="text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#18181B] rounded-[6px] h-8 w-8"
                title="Target Databases"
              >
                <Paperclip className="w-4 h-4" />
              </Button>

              <span className="text-[11px] font-mono text-[#A1A1AA] flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-[#00E599]" />
                <span className="hidden sm:inline">Targeting:</span>{" "}
                <span className="text-[#FAFAFA] font-medium truncate max-w-[160px]">
                  {selectedConnIds.length === 0 && enableWebSearch
                    ? "Web Only (No DB)"
                    : selectedConnIds.length === connections.length
                      ? `All (${connections.length})`
                      : selectedConnIds.length === 1
                        ? selectedConnectionNames[0]
                        : `${selectedConnIds.length} DBs`}
                </span>
              </span>

              {/* Web Search Toggle Button */}
              <button
                type="button"
                onClick={() => setEnableWebSearch(!enableWebSearch)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-xs font-mono font-medium transition-all cursor-pointer border ml-1",
                  enableWebSearch
                    ? "bg-[#00E599]/15 border-[#00E599]/50 text-[#00E599] shadow-[0_0_12px_rgba(0,229,153,0.25)]"
                    : "bg-white/[0.03] border-white/[0.08] hover:border-white/[0.15] text-[#A1A1AA] hover:text-[#FAFAFA]"
                )}
                title="Toggle Web Search for competitor analysis, live market rates, and industry benchmarks"
              >
                <Globe className={cn("w-3.5 h-3.5", enableWebSearch && "animate-pulse text-[#00E599]")} />
                <span className="hidden sm:inline">Web Search</span>
                <span className={cn(
                  "text-[9px] px-1 py-0.2 rounded font-bold uppercase",
                  enableWebSearch ? "bg-[#00E599]/25 text-[#00E599]" : "bg-white/[0.08] text-[#A1A1AA]"
                )}>
                  {enableWebSearch ? "ON" : "OFF"}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden md:inline text-[10px] text-[#A1A1AA] font-mono">
                Press Enter to send
              </span>

              <Button
                type="button"
                onClick={() => handleSubmit()}
                disabled={loading || !prompt.trim() || (!enableWebSearch && selectedConnIds.length === 0)}
                className={cn(
                  "flex items-center gap-1 px-3 py-2 rounded-[6px] transition-all h-8",
                  loading || !prompt.trim() || (!enableWebSearch && selectedConnIds.length === 0)
                    ? "bg-[#18181B] text-[#A1A1AA]/40 cursor-not-allowed border border-white/[0.08]"
                    : "bg-[#00E599] hover:bg-[#00E599]/90 text-[#09090B] font-semibold shadow-sm cursor-pointer"
                )}
              >
                {loading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ArrowUp className="w-3.5 h-3.5" />
                )}
                <span className="sr-only">Send</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Pin Widget Modal (FR-12) */}
      <PinWidgetModal
        isOpen={!!pinTargetWidget}
        onClose={() => setPinTargetWidget(null)}
        widget={pinTargetWidget}
      />
    </div>
  );
}

interface QuickActionChipProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function QuickActionChip({ icon, label, onClick }: QuickActionChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-3.5 py-2 rounded-[6px] border border-white/[0.08] bg-[#18181B] text-[#FAFAFA] hover:text-white hover:bg-[#27272A] hover:border-[#00E599]/40 transition-all text-xs cursor-pointer shadow-sm group"
    >
      <span className="group-hover:scale-110 transition-transform">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
