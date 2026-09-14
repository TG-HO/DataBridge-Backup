"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Lock,
  Mail,
  User,
  Building2,
  Users,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  PlusCircle,
} from "lucide-react";

interface OrganizationOption {
  id: string;
  name: string;
  _count?: {
    members: number;
    dbConnections: number;
  };
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgMode, setOrgMode] = useState<"create" | "join">("create");
  const [orgName, setOrgName] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [availableOrgs, setAvailableOrgs] = useState<OrganizationOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/organizations")
      .then((res) => res.json())
      .then((data) => {
        if (data.organizations && data.organizations.length > 0) {
          setAvailableOrgs(data.organizations);
          setSelectedOrgId(data.organizations[0].id);
        }
      })
      .catch(() => {
        // Fallback gracefully if database not yet migrated
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (orgMode === "create" && !orgName.trim()) {
      setError("Please specify an Organization name");
      setLoading(false);
      return;
    }

    if (orgMode === "join" && !selectedOrgId.trim()) {
      setError("Please select or enter an Organization ID to join");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          organizationMode: orgMode,
          organizationName: orgMode === "create" ? orgName : undefined,
          existingOrgId: orgMode === "join" ? selectedOrgId : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const fullErr = data.details
          ? `${data.error}\n\n${data.details}`
          : data.error || "Failed to register account.";
        setError(fullErr);
        setLoading(false);
        return;
      }

      setSuccess(
        `Registration complete! Organization "${data.organization?.name}" assigned with role ${data.organization?.role}. Redirecting to login...`
      );

      setTimeout(() => {
        router.push("/login");
      }, 1500);
    } catch {
      setError("An unexpected network error occurred.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#09090B] text-[#FAFAFA] relative overflow-hidden font-sans">
      <div className="w-full max-w-lg z-10 my-8">
        {/* Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-[10px] bg-[#18181B] border border-[rgba(255,255,255,0.08)] text-[#00E599] shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)] mb-3">
            <Sparkles className="w-5 h-5 text-[#00E599]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#FAFAFA]">
            Create DataBridge Account
          </h1>
          <p className="text-xs text-[#A1A1AA] mt-1">
            Provision a multi-tenant workspace with SQL Server database connectivity
          </p>
        </div>

        {/* Form Card (L1) */}
        <div className="p-6 sm:p-8 rounded-[10px] bg-[#121215] border border-[rgba(255,255,255,0.08)] shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)] space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-[6px] bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 rounded-[6px] bg-[#00E599]/10 border border-[#00E599]/20 text-[#00E599] text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* User Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#A1A1AA] mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 w-4 h-4 text-[#71717A]" />
                  <input
                    type="text"
                    required
                    placeholder="Alex Rivera"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-[#18181B] border border-[rgba(255,255,255,0.08)] rounded-[6px] text-xs text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:border-[#00E599] focus:ring-1 focus:ring-[#00E599] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A1A1AA] mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-[#71717A]" />
                  <input
                    type="email"
                    required
                    placeholder="alex@enterprise.ai"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-[#18181B] border border-[rgba(255,255,255,0.08)] rounded-[6px] text-xs text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:border-[#00E599] focus:ring-1 focus:ring-[#00E599] transition-colors"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#A1A1AA] mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-[#71717A]" />
                <input
                  type="password"
                  required
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[#18181B] border border-[rgba(255,255,255,0.08)] rounded-[6px] text-xs text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:border-[#00E599] focus:ring-1 focus:ring-[#00E599] transition-colors"
                />
              </div>
            </div>

            {/* Multi-Tenant Organization Selection */}
            <div className="pt-2 border-t border-[rgba(255,255,255,0.08)]">
              <label className="block text-xs font-semibold text-[#FAFAFA] mb-2">
                Multi-Tenant Organization Assignment
              </label>

              {/* Mode Toggle */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#18181B] border border-[rgba(255,255,255,0.08)] rounded-[6px] mb-3">
                <button
                  type="button"
                  onClick={() => setOrgMode("create")}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-[6px] text-xs font-medium transition-all ${
                    orgMode === "create"
                      ? "bg-[#00E599] text-[#09090B] font-semibold shadow-sm"
                      : "text-[#A1A1AA] hover:text-[#FAFAFA]"
                  }`}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Create New Org</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOrgMode("join")}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-[6px] text-xs font-medium transition-all ${
                    orgMode === "join"
                      ? "bg-[#00E599] text-[#09090B] font-semibold shadow-sm"
                      : "text-[#A1A1AA] hover:text-[#FAFAFA]"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Join Existing</span>
                </button>
              </div>

              {orgMode === "create" ? (
                <div>
                  <label className="block text-[11px] text-[#A1A1AA] mb-1">
                    New Organization Name <span className="text-[#00E599] font-mono">(Role: OWNER)</span>
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-2.5 w-4 h-4 text-[#71717A]" />
                    <input
                      type="text"
                      placeholder="e.g. Apex Data Labs"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-[#18181B] border border-[rgba(255,255,255,0.08)] rounded-[6px] text-xs text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:border-[#00E599] focus:ring-1 focus:ring-[#00E599] transition-colors"
                    />
                  </div>
                  <p className="text-[10px] text-[#71717A] mt-1">
                    An Organization record will be created and linked via OrganizationUser junction table.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-[11px] text-[#A1A1AA] mb-1">
                    Select Organization to Join <span className="text-[#00E599] font-mono">(Role: MEMBER)</span>
                  </label>
                  {availableOrgs.length > 0 ? (
                    <select
                      value={selectedOrgId}
                      onChange={(e) => setSelectedOrgId(e.target.value)}
                      className="w-full px-3 py-2 bg-[#18181B] border border-[rgba(255,255,255,0.08)] rounded-[6px] text-xs text-[#FAFAFA] focus:outline-none focus:border-[#00E599] focus:ring-1 focus:ring-[#00E599] transition-colors font-mono"
                    >
                      {availableOrgs.map((org) => (
                        <option key={org.id} value={org.id} className="bg-[#121215] text-[#FAFAFA]">
                          {org.name} (ID: {org.id.slice(0, 8)}...)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Paste Organization ID"
                      value={selectedOrgId}
                      onChange={(e) => setSelectedOrgId(e.target.value)}
                      className="w-full px-3 py-2 bg-[#18181B] border border-[rgba(255,255,255,0.08)] rounded-[6px] text-xs text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:border-[#00E599] focus:ring-1 focus:ring-[#00E599] transition-colors font-mono"
                    />
                  )}
                  <p className="text-[10px] text-[#71717A]">
                    You will be added to the OrganizationUser junction table as a Member.
                  </p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 rounded-[6px] bg-[#00E599] hover:bg-[#00E599]/90 disabled:opacity-60 text-[#09090B] text-xs font-semibold shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)] transition-all flex items-center justify-center gap-2 group cursor-pointer"
            >
              {loading ? (
                <span>Registering Account & Org...</span>
              ) : (
                <>
                  <span>Create Account & Continue</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="text-center pt-2 border-t border-[rgba(255,255,255,0.08)]">
            <p className="text-xs text-[#A1A1AA]">
              Already have an account?{" "}
              <Link href="/login" className="text-[#00E599] font-medium hover:underline">
                Sign in here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
