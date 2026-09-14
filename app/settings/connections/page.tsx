"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  Database,
  Lock,
  Server,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Radio,
  Eye,
  EyeOff,
  RefreshCw,
  Building2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Trash2,
  Copy,
  Check,
} from "lucide-react";
import {
  createDbConnection,
  testDbConnection,
  syncDatabaseSchema,
  deleteDbConnection,
  getOrgContextAndConnections,
} from "@/app/actions/db-connections";

interface DbConnectionItem {
  id: string;
  name: string;
  dbType: string;
  host: string;
  port: number;
  dbName: string;
  username: string;
  schemaContext?: string;
  createdAt: string;
}

const DEFAULT_PORTS: Record<string, number> = {
  mssql: 1433,
  postgres: 5432,
  mysql: 3306,
  mongodb: 27017,
  firebase: 443,
};

const DATABASE_ENGINES = [
  { id: "mssql", label: "SQL Server", desc: "Port 1433" },
  { id: "mysql", label: "MySQL", desc: "Port 3306" },
  { id: "postgres", label: "Postgres / Supabase", desc: "Port 5432 / SSL" },
  { id: "mongodb", label: "MongoDB", desc: "Port 27017 / SRV" },
  { id: "firebase", label: "Firebase Firestore", desc: "Cloud Firestore" },
];

export default function DatabaseConnectionsPage() {
  const [isPending, startTransition] = useTransition();

  // Active tenant organization state
  const [orgId, setOrgId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [userRole, setUserRole] = useState("MEMBER");
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Form states
  const [name, setName] = useState("");
  const [dbType, setDbType] = useState("mssql");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(1433);
  const [dbName, setDbName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [schemaContext, setSchemaContext] = useState("dbo");
  const [showPassword, setShowPassword] = useState(false);

  // Status & Feedback
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedSchemaId, setExpandedSchemaId] = useState<string | null>(null);

  // Real connections list
  const [connections, setConnections] = useState<DbConnectionItem[]>([]);

  useEffect(() => {
    async function loadData() {
      setLoadingInitial(true);
      const res = await getOrgContextAndConnections();
      if (res.success) {
        setOrgId(res.orgId);
        setOrgName(res.orgName);
        if (res.inviteCode) setInviteCode(res.inviteCode);
        setUserRole(res.role);
        setConnections(res.connections as DbConnectionItem[]);
      }
      setLoadingInitial(false);
    }
    loadData();
  }, []);

  const isOwner = userRole === "OWNER";

  const handleDbTypeChange = (type: string) => {
    setDbType(type);
    setPort(DEFAULT_PORTS[type] || 1433);
    if (type === "mssql") {
      setSchemaContext("dbo");
      if (!username) setUsername("sa");
    } else if (type === "postgres") {
      setSchemaContext("public");
      if (!username) setUsername("postgres");
      if (!dbName) setDbName("postgres");
    } else if (type === "mysql") {
      setSchemaContext("");
      if (!username) setUsername("root");
    } else if (type === "mongodb") {
      setSchemaContext("");
      if (!dbName) setDbName("production");
    } else if (type === "firebase") {
      setSchemaContext("");
      if (!dbName) setDbName("firestore");
      if (!username) setUsername("firebase-adminsdk");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!isOwner) {
      setStatusMessage({
        type: "error",
        text: "Access Denied: Only organization Owners have permission to configure database connections.",
      });
      return;
    }

    setStatusMessage(null);

    startTransition(async () => {
      const response = await createDbConnection({
        orgId,
        name,
        dbType,
        host,
        port,
        dbName,
        username,
        password,
        schemaContext,
      });

      if (response.success) {
        setStatusMessage({
          type: "success",
          text: response.message || "Database connection saved securely.",
        });

        // Add to local state
        const newConnItem: DbConnectionItem = {
          id: response.data?.id || `conn-${Date.now()}`,
          name,
          dbType,
          host,
          port: Number(port),
          dbName,
          username,
          schemaContext: response.data?.schemaContext || schemaContext,
          createdAt: "Just now",
        };
        setConnections((prev) => [newConnItem, ...prev]);

        // Reset form
        setName("");
        setHost("");
        setDbName("");
        setUsername("");
        setPassword("");
      } else {
        setStatusMessage({
          type: "error",
          text: response.error || "Failed to create database connection.",
        });
      }
    });
  };

  const handleTestConnection = async (connId: string) => {
    setTestingId(connId);
    const res = await testDbConnection(connId, orgId);
    if (res.success) {
      setTestResults((prev) => ({
        ...prev,
        [connId]: `✓ ${res.message}`,
      }));
    } else {
      setTestResults((prev) => ({
        ...prev,
        [connId]: `✗ Error: ${res.error}`,
      }));
    }
    setTestingId(null);
  };

  const handleSyncSchema = async (connId: string) => {
    setSyncingId(connId);
    setStatusMessage(null);

    const res = await syncDatabaseSchema(connId, orgId);

    if (res.success && res.data?.schemaContext) {
      setConnections((prev) =>
        prev.map((c) =>
          c.id === connId ? { ...c, schemaContext: res.data!.schemaContext } : c
        )
      );
      setExpandedSchemaId(connId);
      setStatusMessage({
        type: "success",
        text: res.message || "Schema extracted & schemaContext updated for RAG context injection.",
      });
    } else {
      setStatusMessage({
        type: "error",
        text: res.error || "Failed to extract database schema.",
      });
    }

    setSyncingId(null);
  };

  const handleDeleteConnection = async (connId: string, connName: string) => {
    if (!window.confirm(`Are you sure you want to disconnect and delete "${connName}"?`)) {
      return;
    }

    setDeletingId(connId);
    const res = await deleteDbConnection(connId, orgId);

    if (res.success) {
      setConnections((prev) => prev.filter((c) => c.id !== connId));
      setStatusMessage({
        type: "success",
        text: `Disconnected and removed "${connName}".`,
      });
    } else {
      setStatusMessage({
        type: "error",
        text: res.error || "Failed to delete connection.",
      });
    }
    setDeletingId(null);
  };

  if (loadingInitial) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3 text-[#A1A1AA] text-xs font-mono">
          <RefreshCw className="w-4 h-4 animate-spin text-[#00E599]" />
          <span>Loading organization database settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 font-sans">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between pb-4 border-b border-[rgba(255,255,255,0.08)]">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-[6px] bg-[#18181B] hover:bg-[#27272A] border border-[rgba(255,255,255,0.08)] text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-[#FAFAFA] tracking-tight">
                Database Connections
              </h1>
              <span
                className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-[6px] border ${
                  isOwner
                    ? "bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30"
                    : "bg-[#00E599]/15 text-[#00E599] border-[#00E599]/30"
                }`}
              >
                Role: {userRole}
              </span>
            </div>
            <p className="text-xs text-[#A1A1AA] mt-0.5">
              Secure AES-256 encrypted credential store &amp; dynamic multi-database schema discovery
            </p>
          </div>
        </div>

        {/* Tenant Organization Indicator & Invite Code */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] bg-[#18181B] border border-[rgba(255,255,255,0.08)] text-xs text-[#A1A1AA]">
            <Building2 className="w-3.5 h-3.5 text-[#00E599]" />
            <span className="font-medium text-[#FAFAFA]">{orgName}</span>
          </div>

          {inviteCode && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] bg-[#18181B] border border-[#00E599]/30 text-xs">
              <span className="text-[10px] uppercase tracking-wider text-[#A1A1AA]">Invite Code:</span>
              <span className="font-mono font-bold text-[#00E599]">{inviteCode}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(inviteCode);
                  setCopiedInvite(true);
                  setTimeout(() => setCopiedInvite(false), 2000);
                }}
                className="p-0.5 hover:text-[#00E599] text-[#A1A1AA] transition-colors"
                title="Copy Organization Invite Code"
              >
                {copiedInvite ? (
                  <Check className="w-3.5 h-3.5 text-[#00E599]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Column (Owners Only) */}
        {isOwner && (
          <div className="lg:col-span-7 space-y-6">
            <div className="p-6 rounded-[10px] bg-[#121215] border border-[rgba(255,255,255,0.08)] shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)] space-y-5">
              <div className="flex items-center gap-2 pb-3 border-b border-[rgba(255,255,255,0.08)]">
                <Database className="w-4 h-4 text-[#00E599]" />
                <h3 className="text-sm font-semibold text-[#FAFAFA]">Add Database Connection</h3>
              </div>

              {statusMessage && (
                <div
                  className={`p-3 rounded-[6px] border text-xs flex items-center gap-2 ${
                    statusMessage.type === "success"
                      ? "bg-[#00E599]/10 border-[#00E599]/20 text-[#00E599]"
                      : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                  }`}
                >
                  {statusMessage.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{statusMessage.text}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Connection Name */}
                <div>
                  <label className="block text-xs font-medium text-[#A1A1AA] mb-1.5">
                    Connection Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Production Analytics or Supabase Live"
                    className="w-full text-xs bg-[#18181B] border border-[rgba(255,255,255,0.08)] rounded-[6px] px-3.5 py-2.5 text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:border-[#00E599] focus:ring-1 focus:ring-[#00E599] transition-colors"
                  />
                </div>

                {/* Database Engine Type */}
                <div>
                  <label className="block text-xs font-medium text-[#A1A1AA] mb-1.5">
                    Database Engine
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {DATABASE_ENGINES.map((engine) => (
                      <button
                        key={engine.id}
                        type="button"
                        onClick={() => handleDbTypeChange(engine.id)}
                        className={`p-2.5 rounded-[6px] border text-left transition-all cursor-pointer ${
                          dbType === engine.id
                            ? "bg-[#00E599]/15 border-[#00E599] text-[#FAFAFA] shadow-sm"
                            : "bg-[#18181B] border-[rgba(255,255,255,0.08)] text-[#A1A1AA] hover:border-[rgba(255,255,255,0.15)] hover:text-[#FAFAFA]"
                        }`}
                      >
                        <div className="text-xs font-semibold">{engine.label}</div>
                        <div className="text-[10px] font-mono text-[#71717A] mt-0.5">
                          {engine.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Host & Port */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-medium text-[#A1A1AA] mb-1.5">
                      {dbType === "firebase"
                        ? "Firebase Project ID"
                        : dbType === "mongodb"
                        ? "Host / MongoDB URI"
                        : dbType === "postgres"
                        ? "Host / Supabase Pooler (e.g. db.xyz.supabase.co)"
                        : "Host Address / Server IP"}
                    </label>
                    <input
                      type="text"
                      required
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder={
                        dbType === "firebase"
                          ? "e.g. databridge-prod-app"
                          : dbType === "mongodb"
                          ? "cluster0.abc.mongodb.net or localhost"
                          : dbType === "postgres"
                          ? "aws-0-us-east-1.pooler.supabase.com"
                          : "103.79.17.77 or localhost"
                      }
                      className="w-full text-xs bg-[#18181B] border border-[rgba(255,255,255,0.08)] rounded-[6px] px-3.5 py-2.5 text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:border-[#00E599] focus:ring-1 focus:ring-[#00E599] font-mono transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#A1A1AA] mb-1.5">
                      Port
                    </label>
                    <input
                      type="number"
                      required
                      value={port}
                      onChange={(e) => setPort(Number(e.target.value))}
                      className="w-full text-xs bg-[#18181B] border border-[rgba(255,255,255,0.08)] rounded-[6px] px-3.5 py-2.5 text-[#FAFAFA] focus:outline-none focus:border-[#00E599] focus:ring-1 focus:ring-[#00E599] font-mono transition-colors"
                    />
                  </div>
                </div>

                {/* Database Name & Schema */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#A1A1AA] mb-1.5">
                      {dbType === "firebase" ? "Database / Scope" : "Database Name"}
                    </label>
                    <input
                      type="text"
                      required
                      value={dbName}
                      onChange={(e) => setDbName(e.target.value)}
                      placeholder={
                        dbType === "firebase"
                          ? "firestore"
                          : dbType === "postgres"
                          ? "postgres"
                          : "e.g. databridge_enterprise"
                      }
                      className="w-full text-xs bg-[#18181B] border border-[rgba(255,255,255,0.08)] rounded-[6px] px-3.5 py-2.5 text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:border-[#00E599] focus:ring-1 focus:ring-[#00E599] font-mono transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#A1A1AA] mb-1.5">
                      Schema / Prefix (Optional)
                    </label>
                    <input
                      type="text"
                      value={schemaContext}
                      onChange={(e) => setSchemaContext(e.target.value)}
                      placeholder={
                        dbType === "postgres"
                          ? "public"
                          : dbType === "mssql"
                          ? "dbo"
                          : "optional"
                      }
                      className="w-full text-xs bg-[#18181B] border border-[rgba(255,255,255,0.08)] rounded-[6px] px-3.5 py-2.5 text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:border-[#00E599] focus:ring-1 focus:ring-[#00E599] font-mono transition-colors"
                    />
                  </div>
                </div>

                {/* Username & Password */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#A1A1AA] mb-1.5">
                      {dbType === "firebase" ? "Client Email / Account ID" : "Database Username"}
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={
                        dbType === "firebase"
                          ? "firebase-adminsdk@..."
                          : dbType === "postgres"
                          ? "postgres.projectref or postgres"
                          : "e.g. sa / root"
                      }
                      className="w-full text-xs bg-[#18181B] border border-[rgba(255,255,255,0.08)] rounded-[6px] px-3.5 py-2.5 text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:border-[#00E599] focus:ring-1 focus:ring-[#00E599] font-mono transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#A1A1AA] mb-1.5">
                      {dbType === "firebase"
                        ? "Private Key / Service Account JSON"
                        : "Password (AES-256 Encrypted)"}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full text-xs bg-[#18181B] border border-[rgba(255,255,255,0.08)] rounded-[6px] px-3.5 py-2.5 pr-10 text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:border-[#00E599] focus:ring-1 focus:ring-[#00E599] font-mono transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71717A] hover:text-[#FAFAFA] cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full mt-3 py-2.5 px-4 rounded-[6px] bg-[#00E599] hover:bg-[#00E599]/90 disabled:opacity-60 text-[#09090B] text-xs font-semibold shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isPending ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Encrypting &amp; Syncing Schema...</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Secure &amp; Register Connection</span>
                    </span>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Existing Connections Column */}
        <div className={isOwner ? "lg:col-span-5 space-y-4" : "lg:col-span-12 space-y-4"}>
          <div className="p-6 rounded-[10px] bg-[#121215] border border-[rgba(255,255,255,0.08)] shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(255,255,255,0.08)]">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-[#00E599]" />
                <h3 className="text-sm font-semibold text-[#FAFAFA]">Active Connections</h3>
              </div>
              <span className="text-xs font-mono text-[#A1A1AA]">
                {connections.length} configured
              </span>
            </div>

            {connections.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <Database className="w-8 h-8 text-[#71717A] mx-auto" />
                <p className="text-xs text-[#A1A1AA] font-medium">No database connections yet</p>
                <p className="text-[11px] text-[#71717A]">
                  {isOwner
                    ? "Fill in parameters to connect your first database (SQL Server, MySQL, Postgres, Supabase, MongoDB, or Firebase)."
                    : "Ask your Organization Owner to configure database connections."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {connections.map((conn) => (
                  <div
                    key={conn.id}
                    className="p-3.5 rounded-[6px] bg-[#18181B] border border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)] transition-all space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-semibold text-[#FAFAFA] flex items-center gap-1.5">
                          <Server className="w-3.5 h-3.5 text-[#00E599]" />
                          <span>{conn.name}</span>
                        </h4>
                        <p className="text-[11px] text-[#A1A1AA] font-mono mt-0.5 truncate max-w-[200px]">
                          {conn.host}:{conn.port}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-[6px] bg-[#00E599]/10 text-[#00E599] border border-[#00E599]/20">
                          {conn.dbType}
                        </span>
                        {isOwner && (
                          <button
                            type="button"
                            disabled={deletingId === conn.id}
                            onClick={() => handleDeleteConnection(conn.id, conn.name)}
                            title="Disconnect and remove database"
                            className="p-1 rounded-[6px] text-[#71717A] hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-40 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-[#121215] p-2 rounded-[6px] border border-[rgba(255,255,255,0.08)] font-mono text-[#A1A1AA]">
                      <div>
                        <span className="text-[#71717A]">db:</span> {conn.dbName}
                      </div>
                      <div>
                        <span className="text-[#71717A]">user:</span> {conn.username || "auth"}
                      </div>
                      <div>
                        <span className="text-[#71717A]">schema:</span> {conn.schemaContext ? "synced" : "pending"}
                      </div>
                      <div className="text-[#00E599] flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        <span>AES-256</span>
                      </div>
                    </div>

                    {/* Action Buttons: Test Ping & Sync Schema */}
                    <div className="pt-1 flex flex-wrap items-center gap-2 justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={testingId === conn.id}
                          onClick={() => handleTestConnection(conn.id)}
                          className="px-2.5 py-1 rounded-[6px] bg-[#121215] hover:bg-[#27272A] border border-[rgba(255,255,255,0.08)] text-xs text-[#FAFAFA] transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                        >
                          {testingId === conn.id ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin text-[#00E599]" />
                              <span>Testing...</span>
                            </>
                          ) : (
                            <>
                              <Radio className="w-3 h-3 text-[#00E599]" />
                              <span>Test Handshake</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          disabled={syncingId === conn.id}
                          onClick={() => handleSyncSchema(conn.id)}
                          className="px-2.5 py-1 rounded-[6px] bg-[#00E599]/15 hover:bg-[#00E599]/25 border border-[#00E599]/30 text-xs text-[#00E599] transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                        >
                          {syncingId === conn.id ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin text-[#00E599]" />
                              <span>Extracting Schema...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3 text-[#00E599]" />
                              <span>Sync RAG Schema</span>
                            </>
                          )}
                        </button>
                      </div>

                      <span className="text-[10px] text-[#71717A] font-mono">
                        {conn.createdAt}
                      </span>
                    </div>

                    {/* Test Result Message */}
                    {testResults[conn.id] && (
                      <div className="p-2 rounded-[6px] bg-[#121215] border border-[rgba(255,255,255,0.08)] text-[11px] font-mono text-[#FAFAFA] leading-snug">
                        {testResults[conn.id]}
                      </div>
                    )}

                    {/* Schema Context for Dynamic RAG Injection */}
                    {conn.schemaContext && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSchemaId(
                              expandedSchemaId === conn.id ? null : conn.id
                            )
                          }
                          className="w-full flex items-center justify-between p-2 rounded-[6px] bg-[#121215] hover:bg-[#27272A] border border-[rgba(255,255,255,0.08)] text-[11px] font-mono text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5 text-[#00E599]">
                            <Sparkles className="w-3 h-3 text-[#00E599]" />
                            <span>RAG Schema Metadata (Injected to AI)</span>
                          </span>
                          {expandedSchemaId === conn.id ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {expandedSchemaId === conn.id && (
                          <div className="mt-2 p-3 rounded-[6px] bg-[#09090B] border border-[#00E599]/20 text-[10px] font-mono text-[#FAFAFA] whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                            {conn.schemaContext}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
