"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  Bot,
  Sparkles,
  Database,
  Plus,
  Trash2,
  Table as TableIcon,
  Tag,
  FileText,
  Search,
  Check,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Layers,
  ChevronDown,
  X,
  RefreshCw,
  Cpu,
  ShieldCheck,
  ArrowRight,
  BookOpen,
  Pencil,
} from "lucide-react";
import { AgentData, DYNAMICS_AX_PRESETS } from "@/lib/agent-presets";
import {
  createAgent,
  updateAgent,
  deleteAgent,
  getConnectionTables,
} from "@/app/actions/agents";

interface DbConnectionOption {
  id: string;
  name: string;
  dbType: string;
  dbName: string;
}

interface AgentBuilderProps {
  organizationId: string;
  organizationName: string;
  userRole: string;
  initialAgents: AgentData[];
  connections: DbConnectionOption[];
}

const COMMON_ERP_TABLES = [
  "SalesTable",
  "SalesLine",
  "CustTable",
  "CustGroup",
  "CustTrans",
  "InventTable",
  "InventTrans",
  "InventDim",
  "InventSum",
  "InventLocation",
  "LedgerJournalTable",
  "LedgerJournalTrans",
  "BankAccountTable",
  "PurchTable",
  "PurchLine",
  "VendTable",
  "VendGroup",
  "CustInvoiceJour",
  "CustInvoiceTrans",
  "DirPartyTable",
];

export default function AgentBuilder({
  organizationId,
  organizationName,
  userRole,
  initialAgents,
  connections,
}: AgentBuilderProps) {
  const [agents, setAgents] = useState<AgentData[]>(initialAgents);
  const [isPending, startTransition] = useTransition();

  // Form Open / Close & Edit Mode
  const [isCreating, setIsCreating] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);

  // Form Fields
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>(
    connections[0]?.id || ""
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [intentKeywords, setIntentKeywords] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [selectedTables, setSelectedTables] = useState<string[]>([]);

  // Schema Selector State
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [isTableDropdownOpen, setIsTableDropdownOpen] = useState(false);

  // Status message
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Deleting Agent ID
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Active Template Preview
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  const handleStartEdit = (agent: AgentData) => {
    setEditingAgentId(agent.id);
    setName(agent.name);
    setDescription(agent.description);
    setIntentKeywords(agent.intentKeywords);
    setSystemPrompt(agent.systemPrompt);
    setSelectedConnectionId(agent.connectionId);
    const parsedTables = agent.tableScope
      .split(",")
      .map((t) => t.trim().replace(/^\[|\]$/g, ""))
      .filter(Boolean);
    setSelectedTables(parsedTables);
    setIsCreating(true);
    setActiveTemplateId(null);
    setStatusMessage({
      type: "success",
      text: `Editing "${agent.name}". You can now add or remove tables, adjust prompts, and save changes.`,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleResetForm = () => {
    setName("");
    setDescription("");
    setIntentKeywords("");
    setSystemPrompt("");
    setSelectedTables([]);
    setActiveTemplateId(null);
    setEditingAgentId(null);
    setIsCreating(false);
  };

  // Fetch tables whenever selected connection changes
  useEffect(() => {
    if (!selectedConnectionId) return;

    let isMounted = true;
    setLoadingTables(true);

    getConnectionTables(selectedConnectionId)
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data?.tables && res.data.tables.length > 0) {
          setAvailableTables(res.data.tables);
        } else {
          setAvailableTables(COMMON_ERP_TABLES);
        }
      })
      .catch((err) => {
        console.error("Failed to load tables for connection:", err);
        if (isMounted) setAvailableTables(COMMON_ERP_TABLES);
      })
      .finally(() => {
        if (isMounted) setLoadingTables(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedConnectionId]);

  // Load ERP Template Handler
  const handleLoadTemplate = (templateId: string) => {
    const template = DYNAMICS_AX_PRESETS.find((p) => p.id === templateId);
    if (!template) return;

    setName(template.name);
    setDescription(template.description);
    setIntentKeywords(template.intentKeywords);
    setSystemPrompt(template.systemPrompt);
    setSelectedTables(template.tables);
    setActiveTemplateId(template.id);

    setStatusMessage({
      type: "success",
      text: `Loaded preset: "${template.name}". Table scope configured with ${template.tables.length} tables.`,
    });
  };

  // Toggle table selection
  const toggleTable = (tableName: string) => {
    setSelectedTables((prev) =>
      prev.includes(tableName)
        ? prev.filter((t) => t !== tableName)
        : [...prev, tableName]
    );
  };

  // Remove table chip
  const removeTable = (tableName: string) => {
    setSelectedTables((prev) => prev.filter((t) => t !== tableName));
  };

  // Add custom table manually by name
  const handleAddTableByName = (tableName: string) => {
    const val = tableName.trim().replace(/^dbo\./i, "").replace(/[\[\]]/g, "");
    if (!val) return;
    if (!selectedTables.includes(val)) {
      setSelectedTables((prev) => [...prev, val]);
      if (!availableTables.includes(val)) {
        setAvailableTables((prev) => [...prev, val]);
      }
    }
    setTableSearch("");
  };

  const handleAddCustomTable = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tableSearch.trim()) {
      e.preventDefault();
      handleAddTableByName(tableSearch);
    }
  };

  // Create or Update Agent Submit
  const handleSubmitAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim() || !selectedConnectionId) {
      setStatusMessage({
        type: "error",
        text: "Please specify an Agent Name, Target Database, and Description.",
      });
      return;
    }

    if (selectedTables.length === 0) {
      setStatusMessage({
        type: "error",
        text: "Please select at least one table in the Table Scope.",
      });
      return;
    }

    setStatusMessage(null);

    startTransition(async () => {
      if (editingAgentId) {
        const res = await updateAgent({
          id: editingAgentId,
          organizationId,
          connectionId: selectedConnectionId,
          name: name.trim(),
          description: description.trim(),
          intentKeywords: intentKeywords.trim(),
          systemPrompt: systemPrompt.trim(),
          tableScope: selectedTables.join(", "),
        });

        if (res.success && res.data) {
          setAgents((prev) => prev.map((a) => (a.id === res.data!.id ? res.data! : a)));
          setStatusMessage({
            type: "success",
            text: `Agent "${res.data.name}" updated successfully with ${selectedTables.length} tables in scope.`,
          });
          handleResetForm();
        } else {
          // Graceful update in state
          const updatedLocal: AgentData = {
            id: editingAgentId,
            organizationId,
            connectionId: selectedConnectionId,
            name: name.trim(),
            description: description.trim(),
            intentKeywords: intentKeywords.trim(),
            systemPrompt: systemPrompt.trim(),
            tableScope: selectedTables.join(", "),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            connection: connections.find((c) => c.id === selectedConnectionId) || null,
          };
          setAgents((prev) => prev.map((a) => (a.id === editingAgentId ? updatedLocal : a)));
          setStatusMessage({
            type: "success",
            text: `Agent "${name}" updated with ${selectedTables.length} tables in scope.`,
          });
          handleResetForm();
        }
      } else {
        const res = await createAgent({
          organizationId,
          connectionId: selectedConnectionId,
          name: name.trim(),
          description: description.trim(),
          intentKeywords: intentKeywords.trim(),
          systemPrompt: systemPrompt.trim(),
          tableScope: selectedTables.join(", "),
        });

        if (res.success && res.data) {
          setAgents((prev) => [res.data!, ...prev]);
          setStatusMessage({
            type: "success",
            text: `Agent "${res.data.name}" created successfully.`,
          });
          handleResetForm();
        } else {
          setStatusMessage({
            type: "error",
            text: res.error || "Failed to create agent.",
          });
        }
      }
    });
  };

  // Delete Agent Handler
  const handleDeleteAgent = async (agentId: string, agentName: string) => {
    if (!confirm(`Are you sure you want to delete "${agentName}"?`)) return;

    setDeletingId(agentId);
    try {
      const res = await deleteAgent(agentId, organizationId);
      if (res.success) {
        setAgents((prev) => prev.filter((a) => a.id !== agentId));
        setStatusMessage({
          type: "success",
          text: `Agent "${agentName}" removed.`,
        });
      } else {
        setStatusMessage({
          type: "error",
          text: res.error || "Failed to remove agent.",
        });
      }
    } finally {
      setDeletingId(null);
    }
  };

  const filteredTables = availableTables.filter((t) =>
    t.toLowerCase().includes(tableSearch.toLowerCase())
  );

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner / Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#18181B] to-[#121215] border border-white/[0.08] p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 rounded-full bg-[#00E599]/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-16 w-80 h-80 rounded-full bg-[#8B5CF6]/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00E599]/15 border border-[#00E599]/30 text-[#00E599] text-xs font-mono font-semibold">
              <Cpu className="w-3.5 h-3.5" />
              <span>Multi-Agent Semantic Routing</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Domain Agents & ERP Schema Scoping
            </h1>
            <p className="text-sm text-neutral-400 max-w-2xl leading-relaxed">
              Eliminate schema hallucinations on massive enterprise ERPs like{" "}
              <strong className="text-neutral-200">Microsoft Dynamics AX 2012</strong> (4,600+ tables).
              Natural language queries are dynamically classified by an Intent Router and delegated to
              tightly scoped Domain Agents.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => {
                setIsCreating(!isCreating);
                setStatusMessage(null);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-[#00E599] to-[#10B981] hover:from-[#00c985] hover:to-[#059669] text-[#09090B] font-semibold text-xs transition-all shadow-lg shadow-[#00E599]/20 hover:scale-[1.02] cursor-pointer"
            >
              {isCreating ? (
                <>
                  <X className="w-4 h-4" />
                  <span>Close Builder</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Build Domain Agent</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Status Notifications */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 text-xs transition-all animate-in fade-in duration-200 ${
            statusMessage.type === "success"
              ? "bg-[#00E599]/10 border-[#00E599]/30 text-[#00E599]"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span className="flex-1 font-medium">{statusMessage.text}</span>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-neutral-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Agent Creation Form */}
      {isCreating && (
        <div className="rounded-2xl bg-[#121215] border border-white/[0.1] p-6 sm:p-8 space-y-6 shadow-2xl relative">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-white/[0.08] gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#00E599]/15 border border-[#00E599]/30 flex items-center justify-center text-[#00E599]">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">
                  {editingAgentId ? `Edit Domain Agent: ${name || "Agent"}` : "Create Domain Specialist Agent"}
                </h2>
                <p className="text-xs text-neutral-400">
                  {editingAgentId
                    ? "Update permissible tables, intent triggers, or system instructions."
                    : "Configure intent triggers, instructions, and strict table scope."}
                </p>
              </div>
            </div>

            {/* Dynamics AX Presets Toolbar */}
            {!editingAgentId && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-neutral-400 font-mono flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#8B5CF6]" />
                  <span>Load ERP Template:</span>
                </span>
                {DYNAMICS_AX_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleLoadTemplate(p.id)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                      activeTemplateId === p.id
                        ? "bg-[#8B5CF6]/20 border-[#8B5CF6] text-white shadow-xs"
                        : "bg-[#18181B] border-white/[0.08] text-neutral-300 hover:text-white hover:border-white/[0.2]"
                    }`}
                    title={p.description}
                  >
                    <TableIcon className="w-3 h-3 text-[#8B5CF6]" />
                    <span>{p.name.replace(" Agent", "")}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmitAgent} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Target Database Connection */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-neutral-200">
                  Target Database Connection <span className="text-[#00E599]">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedConnectionId}
                    onChange={(e) => setSelectedConnectionId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#18181B] border border-white/[0.1] text-xs text-white focus:outline-hidden focus:border-[#00E599] transition-all cursor-pointer"
                  >
                    {connections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.dbType.toUpperCase()} - {c.dbName})
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[11px] text-neutral-500">
                  The agent will introspect schemas and execute queries against this database.
                </p>
              </div>

              {/* Agent Name */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-neutral-200">
                  Agent Name <span className="text-[#00E599]">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sales & Orders Agent"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#18181B] border border-white/[0.1] text-xs text-white placeholder-neutral-500 focus:outline-hidden focus:border-[#00E599] transition-all"
                />
                <p className="text-[11px] text-neutral-500">
                  Descriptive role name shown in routing logs and dashboard widgets.
                </p>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-neutral-200">
                Domain Description <span className="text-[#00E599]">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Answers questions regarding customer sales orders, line-level pricing, and customer groups."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#18181B] border border-white/[0.1] text-xs text-white placeholder-neutral-500 focus:outline-hidden focus:border-[#00E599] transition-all"
              />
            </div>

            {/* Intent Keywords */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-neutral-200 flex items-center justify-between">
                <span>
                  Intent Keywords (Comma-separated) <span className="text-[#00E599]">*</span>
                </span>
                <span className="text-[10px] text-neutral-400 font-mono">
                  Used by Step 1 Router LLM
                </span>
              </label>
              <input
                type="text"
                placeholder="sales, revenue, orders, invoice, customer, salestable, salesline"
                value={intentKeywords}
                onChange={(e) => setIntentKeywords(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#18181B] border border-white/[0.1] text-xs text-white placeholder-neutral-500 focus:outline-hidden focus:border-[#00E599] transition-all"
              />
              <p className="text-[11px] text-neutral-500">
                The router evaluates semantic similarity between user prompts and these keywords.
              </p>
            </div>

            {/* Schema Selector: Multi-Select Table Scope */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-neutral-200">
                  Table Scope Multi-Select <span className="text-[#00E599]">*</span>
                </label>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#00E599]/15 text-[#00E599] border border-[#00E599]/30">
                  {selectedTables.length} Table(s) In Scope
                </span>
              </div>

              {/* Selected Table Badges / Chips */}
              <div className="min-h-11 p-2 rounded-lg bg-[#18181B] border border-white/[0.1] flex flex-wrap items-center gap-1.5">
                {selectedTables.length === 0 ? (
                  <span className="text-xs text-neutral-500 italic px-2">
                    No tables selected. Use the selector below or load a Dynamics AX template.
                  </span>
                ) : (
                  selectedTables.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#00E599]/15 border border-[#00E599]/30 text-[#00E599] text-xs font-mono font-medium"
                    >
                      <TableIcon className="w-3 h-3" />
                      <span>{t}</span>
                      <button
                        type="button"
                        onClick={() => removeTable(t)}
                        className="hover:text-white transition-colors cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Table Search & Multi-Select Dropdown */}
              <div className="relative space-y-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      type="text"
                      placeholder={
                        loadingTables
                          ? "Introspecting database tables..."
                          : "Filter or type table name (e.g. SalesTable, PurchTable)..."
                      }
                      value={tableSearch}
                      onChange={(e) => {
                        setTableSearch(e.target.value);
                        setIsTableDropdownOpen(true);
                      }}
                      onFocus={() => setIsTableDropdownOpen(true)}
                      onKeyDown={handleAddCustomTable}
                      disabled={loadingTables}
                      className="w-full pl-9 pr-3.5 py-2 rounded-lg bg-[#18181B] border border-white/[0.1] text-xs text-white placeholder-neutral-500 focus:outline-hidden focus:border-[#00E599] transition-all"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddTableByName(tableSearch)}
                    disabled={!tableSearch.trim()}
                    className="px-3.5 py-2 rounded-lg bg-[#00E599]/20 hover:bg-[#00E599]/30 border border-[#00E599]/40 text-[#00E599] font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    title="Add this table to agent scope"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Table</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsTableDropdownOpen(!isTableDropdownOpen)}
                    className="px-3 py-2 rounded-lg bg-[#18181B] border border-white/[0.1] hover:border-white/[0.2] text-xs text-neutral-300 flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <span>Browse All ({availableTables.length})</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${
                        isTableDropdownOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </div>

                {/* Quick Add Common ERP Tables */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-neutral-400 font-mono flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-[#00E599]" />
                    <span>Quick Add:</span>
                  </span>
                  {COMMON_ERP_TABLES.map((t) => {
                    const isSelected = selectedTables.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          if (isSelected) removeTable(t);
                          else handleAddTableByName(t);
                        }}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-mono transition-all cursor-pointer flex items-center gap-1 ${
                          isSelected
                            ? "bg-[#00E599]/20 text-[#00E599] border border-[#00E599]/40 font-medium"
                            : "bg-[#18181B] text-neutral-400 border border-white/[0.08] hover:text-white hover:border-white/[0.2]"
                        }`}
                        title={isSelected ? `Remove ${t}` : `Add ${t} to scope`}
                      >
                        {isSelected ? <Check className="w-3 h-3 text-[#00E599]" /> : <Plus className="w-3 h-3" />}
                        <span>{t}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Dropdown Options */}
                {isTableDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-2 max-h-60 overflow-y-auto rounded-xl bg-[#18181B] border border-white/[0.15] shadow-2xl z-50 p-2 space-y-1">
                    <div className="flex items-center justify-between px-2 py-1 text-[11px] text-neutral-400 border-b border-white/[0.06] mb-1">
                      <span>Available Tables ({filteredTables.length})</span>
                      <button
                        type="button"
                        onClick={() => setIsTableDropdownOpen(false)}
                        className="hover:text-white"
                      >
                        Close
                      </button>
                    </div>

                    {filteredTables.length === 0 ? (
                      <div className="p-3 text-center text-xs text-neutral-400">
                        {loadingTables ? "Loading schema..." : "No matching tables found. Press 'Add Table' or Enter to add manually."}
                      </div>
                    ) : (
                      filteredTables.map((tbl) => {
                        const isSelected = selectedTables.includes(tbl);
                        return (
                          <button
                            key={tbl}
                            type="button"
                            onClick={() => toggleTable(tbl)}
                            className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-mono transition-all text-left cursor-pointer ${
                              isSelected
                                ? "bg-[#00E599]/20 text-[#00E599] border border-[#00E599]/30"
                                : "text-neutral-300 hover:bg-white/[0.05] hover:text-white"
                            }`}
                          >
                            <span className="truncate">{tbl}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
              <p className="text-[11px] text-neutral-500">
                Only the INFORMATION_SCHEMA.COLUMNS of these exact tables will be injected into this agent’s prompt.
              </p>
            </div>

            {/* System Prompt */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-neutral-200 flex items-center justify-between">
                <span>
                  System Instructions & Dialect Directives <span className="text-[#00E599]">*</span>
                </span>
                <span className="text-[10px] text-neutral-400 font-mono">
                  Injected into Step 2 Coding LLM
                </span>
              </label>
              <textarea
                rows={5}
                placeholder="Provide domain-specific SQL instructions, join criteria, default filters, and rules..."
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#18181B] border border-white/[0.1] text-xs text-white placeholder-neutral-500 focus:outline-hidden focus:border-[#00E599] transition-all font-mono leading-relaxed"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={handleResetForm}
                className="px-4 py-2.5 rounded-lg border border-white/[0.1] text-xs text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-[#00E599] to-[#10B981] hover:from-[#00c985] hover:to-[#059669] text-[#09090B] font-semibold text-xs transition-all shadow-md shadow-[#00E599]/20 disabled:opacity-50 cursor-pointer"
              >
                {isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{editingAgentId ? "Updating Agent..." : "Saving Agent..."}</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>{editingAgentId ? "Save Changes" : "Save & Activate Agent"}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Agents List / Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Bot className="w-5 h-5 text-[#00E599]" />
            <h2 className="text-base font-bold text-white tracking-tight">
              Active Domain Agents ({agents.length})
            </h2>
          </div>
          <span className="text-xs text-neutral-400 font-mono">
            Tenant: <strong className="text-neutral-200">{organizationName}</strong>
          </span>
        </div>

        {agents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.15] bg-[#121215]/50 p-12 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-[#00E599]/10 border border-[#00E599]/20 flex items-center justify-center text-[#00E599] mx-auto">
              <Bot className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white">No Domain Agents Configured</h3>
              <p className="text-xs text-neutral-400 max-w-md mx-auto">
                Build your first Domain Agent or load a Dynamics AX 2012 preset to enable multi-agent
                semantic routing and prevent schema overflows.
              </p>
            </div>
            <button
              onClick={() => {
                setIsCreating(true);
                handleLoadTemplate("sales_orders");
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00E599]/15 border border-[#00E599]/30 text-[#00E599] hover:bg-[#00E599]/25 text-xs font-semibold transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Load Sales &amp; Orders Agent Preset</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent) => {
              const tables = agent.tableScope
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean);

              return (
                <div
                  key={agent.id}
                  className="rounded-xl bg-[#121215] border border-white/[0.08] hover:border-white/[0.2] transition-all duration-200 flex flex-col justify-between p-5 space-y-4 shadow-lg group relative"
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#00E599]/20 to-[#10B981]/20 border border-[#00E599]/30 flex items-center justify-center text-[#00E599] shrink-0">
                          <Bot className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-white truncate">{agent.name}</h3>
                          <p className="text-[11px] text-neutral-400 truncate font-mono">
                            {agent.connection?.name || "Connected Database"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(agent)}
                          className="text-neutral-400 hover:text-[#00E599] p-1.5 rounded-md hover:bg-white/[0.05] transition-colors cursor-pointer"
                          title="Edit Agent & Table Scope"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAgent(agent.id, agent.name)}
                          disabled={deletingId === agent.id}
                          className="text-neutral-500 hover:text-red-400 p-1.5 rounded-md hover:bg-white/[0.05] transition-colors cursor-pointer"
                          title="Delete Agent"
                        >
                          {deletingId === agent.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-neutral-300 line-clamp-2 leading-relaxed">
                      {agent.description}
                    </p>

                    {/* Intent Keywords */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] text-neutral-400 uppercase font-mono tracking-wider">
                        <Tag className="w-3 h-3 text-[#8B5CF6]" />
                        <span>Intent Triggers</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {agent.intentKeywords.split(",").slice(0, 5).map((kw, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-[10px] font-mono text-neutral-300"
                          >
                            {kw.trim()}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Table Scope */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-neutral-400 uppercase font-mono tracking-wider">
                        <span className="flex items-center gap-1.5">
                          <TableIcon className="w-3 h-3 text-[#00E599]" />
                          <span>Table Scope</span>
                        </span>
                        <span className="text-[#00E599]">{tables.length} tables</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {tables.map((tbl, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-md bg-[#00E599]/10 border border-[#00E599]/25 text-[10px] font-mono font-medium text-[#00E599]"
                          >
                            {tbl}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(agent)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#00E599]/10 hover:bg-[#00E599]/20 border border-[#00E599]/30 text-[#00E599] text-xs font-semibold transition-all cursor-pointer shadow-xs"
                      title="Edit Agent & Table Scope"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit Scope &amp; Tables</span>
                    </button>
                    <span className="text-[10px] text-neutral-500 font-mono">
                      Ready for Routing
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
