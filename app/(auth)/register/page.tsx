"use client";

import { useState } from "react";
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
  KeyRound,
} from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgMode, setOrgMode] = useState<"create" | "join">("create");
  const [orgName, setOrgName] = useState("");
  const [orgCode, setOrgCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

    if (orgMode === "join" && !orgCode.trim()) {
      setError("Please enter the Organization Invite Code provided by your organization owner");
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
          orgCode: orgMode === "join" ? orgCode.trim() : undefined,
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

      if (orgMode === "create" && data.organization?.inviteCode) {
        setSuccess(
          `Registration complete! Organization "${data.organization.name}" created. Invite Code: ${data.organization.inviteCode}. Redirecting to login...`
        );
      } else {
        setSuccess(
          `Registration complete! Joined organization "${data.organization?.name}" as ${data.organization?.role}. Redirecting to login...`
        );
      }

      setTimeout(() => {
        router.push("/login");
      }, 2000);
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
            Provision a secure multi-tenant workspace with database connectivity
          </p>
        </div>

        {/* Form Card */}
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
                Organization Assignment
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
                  <span>Join with Invite Code</span>
                </button>
              </div>

              {orgMode === "create" ? (
                <div>
                  <label className="block text-[11px] text-[#A1A1AA] mb-1">
                    New Organization Name <span className="text-[#00E599] font-mono">(You become OWNER)</span>
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
                  <p className="text-[10px] text-[#71717A] mt-1.5">
                    A unique Organization Invite Code will be generated for you to invite your team members.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-[11px] text-[#A1A1AA] mb-1">
                    Organization Invite Code <span className="text-[#00E599] font-mono">(Role: MEMBER)</span>
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-[#71717A]" />
                    <input
                      type="text"
                      placeholder="e.g. TES-MFGZRW"
                      value={orgCode}
                      onChange={(e) => setOrgCode(e.target.value.toUpperCase())}
                      className="w-full pl-9 pr-3 py-2 bg-[#18181B] border border-[rgba(255,255,255,0.08)] rounded-[6px] text-xs text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:border-[#00E599] focus:ring-1 focus:ring-[#00E599] transition-colors font-mono uppercase tracking-wider"
                    />
                  </div>
                  <p className="text-[10px] text-[#71717A]">
                    Enter the private invite code provided by your organization administrator.
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
