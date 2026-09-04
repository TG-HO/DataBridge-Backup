"use client";

import { useState } from "react";
import { Terminal, Sparkles, Database, RefreshCw, CheckCircle2, AlertCircle, Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

export default function RealtimeQueryConsole({ connections }: RealtimeQueryConsoleProps) {
  const [selectedConnId, setSelectedConnId] = useState<string>(
    connections[0]?.id || ""
  );
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingResponse, setStreamingResponse] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedConn = connections.find((c) => c.id === selectedConnId);

  const handleCopy = () => {
    if (!streamingResponse) return;
    navigator.clipboard.writeText(streamingResponse);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleQuerySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || !selectedConnId || loading) return;

    setLoading(true);
    setError(null);
    setStreamingResponse("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          connectionId: selectedConnId,
          chatHistory: [],
        }),
      });

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

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          accumulated += chunk;
          setStreamingResponse(accumulated);
        }
      }
    } catch (err) {
      console.error("Query execution error:", err);
      setError(err instanceof Error ? err.message : "Failed to execute query.");
    } finally {
      setLoading(false);
    }
  };

  if (connections.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl bg-slate-900/70 border border-white/10 backdrop-blur-xl p-6 shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-white">Natural Language SQL Analyst</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Ask any business question in plain English. The AI dynamically translates, executes against your database, and visualizes the results.
          </p>
        </div>

        {/* Database Selector */}
        <div className="flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedConnId}
            onChange={(e) => setSelectedConnId(e.target.value)}
            className="text-xs bg-slate-950 border border-white/10 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
          >
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.dbType.toUpperCase()})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Query Form */}
      <form onSubmit={handleQuerySubmit} className="space-y-3">
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={`Ask a question against ${selectedConn?.name || "database"} (e.g. "List the names of our Top 10 customers and their type" or "Show monthly revenue breakdown")...`}
            rows={3}
            className="w-full text-xs bg-slate-950/80 border border-white/10 rounded-xl p-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none font-sans"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleQuerySubmit(e);
              }
            }}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-mono">
            {selectedConn?.schemaContext ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                RAG Schema Injected
              </span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Default schema context
              </span>
            )}
          </span>

          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Analyzing &amp; Querying...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Execute Query</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Error Message */}
      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Streaming Results Area */}
      {streamingResponse && (
        <div className="mt-4 p-5 rounded-2xl bg-slate-950/90 border border-indigo-500/30 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold text-white tracking-wide">
                Business Intelligence Analysis
              </span>
            </div>

            <div className="flex items-center gap-3">
              {loading && (
                <span className="flex items-center gap-1.5 text-[10px] text-indigo-400 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Streaming live intelligence...
                </span>
              )}
              <button
                type="button"
                onClick={handleCopy}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors text-xs flex items-center gap-1"
                title="Copy Analysis"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Rendered Presentable Markdown & Tables */}
          <div className="text-xs text-slate-200 leading-relaxed font-sans">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                table: ({ ...props }) => (
                  <div className="overflow-x-auto my-4 rounded-xl border border-white/10 shadow-lg shadow-black/50">
                    <table className="w-full text-left border-collapse text-xs font-mono" {...props} />
                  </div>
                ),
                thead: ({ ...props }) => (
                  <thead className="bg-slate-900/90 border-b border-white/10 text-indigo-300 text-[11px] uppercase tracking-wider font-semibold" {...props} />
                ),
                th: ({ ...props }) => (
                  <th className="py-3 px-4 text-slate-300 font-semibold" {...props} />
                ),
                tbody: ({ ...props }) => (
                  <tbody className="divide-y divide-white/5" {...props} />
                ),
                tr: ({ ...props }) => (
                  <tr className="hover:bg-indigo-500/5 transition-colors odd:bg-slate-950/60 even:bg-slate-900/30" {...props} />
                ),
                td: ({ ...props }) => (
                  <td className="py-2.5 px-4 text-slate-200" {...props} />
                ),
                h1: ({ ...props }) => (
                  <h1 className="text-base font-bold text-white tracking-tight pb-2 border-b border-white/10 mb-3 flex items-center gap-2" {...props} />
                ),
                h2: ({ ...props }) => (
                  <h2 className="text-sm font-bold text-white tracking-tight mt-4 mb-2 flex items-center gap-2 text-indigo-200" {...props} />
                ),
                h3: ({ ...props }) => (
                  <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider mt-5 mb-2.5 flex items-center gap-1.5" {...props} />
                ),
                ul: ({ ...props }) => (
                  <ul className="space-y-2 my-3 pl-1" {...props} />
                ),
                li: ({ ...props }) => (
                  <li className="text-xs text-slate-300 leading-relaxed list-none relative pl-4 before:content-['•'] before:absolute before:left-0 before:text-indigo-400 before:font-bold" {...props} />
                ),
                p: ({ ...props }) => (
                  <p className="text-xs text-slate-300 leading-relaxed my-2" {...props} />
                ),
                strong: ({ ...props }) => (
                  <strong className="font-semibold text-white" {...props} />
                ),
                code: ({ children, ...props }) => (
                  <code className="px-1.5 py-0.5 rounded bg-slate-950 text-indigo-300 border border-white/10 font-mono text-[11px]" {...props}>
                    {children}
                  </code>
                ),
                details: ({ ...props }) => (
                  <details className="mt-5 p-3 rounded-xl bg-slate-950/70 border border-white/10 text-xs font-mono text-slate-400" {...props} />
                ),
                summary: ({ ...props }) => (
                  <summary className="cursor-pointer text-[11px] text-slate-400 hover:text-indigo-300 font-mono transition-colors select-none" {...props} />
                ),
              }}
            >
              {streamingResponse}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
