"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Lock,
  Mail,
  KeyRound,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [orgCode, setOrgCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please verify.");
      setLoading(false);
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          orgCode: orgCode.trim(),
          newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to reset password.");
        setLoading(false);
        return;
      }

      setSuccess("Password has been updated successfully! Redirecting to login...");
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch {
      setError("An unexpected network error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#09090B] text-[#FAFAFA] relative overflow-hidden font-sans">
      <div className="w-full max-w-md z-10">
        {/* Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-[10px] bg-[#18181B] border border-[rgba(255,255,255,0.08)] text-[#00E599] shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)] mb-3">
            <Sparkles className="w-5 h-5 text-[#00E599]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#FAFAFA]">
            Reset Account Password
          </h1>
          <p className="text-xs text-[#A1A1AA] mt-1">
            Verify your workspace membership and establish a new credential
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
            <div>
              <label className="block text-xs font-medium text-[#A1A1AA] mb-1">
                Account Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-[#71717A]" />
                <input
                  type="email"
                  required
                  placeholder="analyst@enterprise.ai"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[#18181B] border border-[rgba(255,255,255,0.08)] rounded-[6px] text-xs text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:border-[#00E599] focus:ring-1 focus:ring-[#00E599] transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#A1A1AA] mb-1">
                Organization Invite Code
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-[#71717A]" />
                <input
                  type="text"
                  required
                  placeholder="e.g. TES-MFGZRW"
                  value={orgCode}
                  onChange={(e) => setOrgCode(e.target.value.toUpperCase())}
                  className="w-full pl-9 pr-3 py-2 bg-[#18181B] border border-[rgba(255,255,255,0.08)] rounded-[6px] text-xs text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:border-[#00E599] focus:ring-1 focus:ring-[#00E599] transition-colors font-mono uppercase tracking-wider"
                />
              </div>
              <p className="text-[10px] text-[#71717A] mt-1">
                Found in your workspace sidebar or provided by your administrator.
              </p>
            </div>

            <div className="pt-2 border-t border-[rgba(255,255,255,0.08)] space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#A1A1AA] mb-1">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-4 h-4 text-[#71717A]" />
                  <input
                    type="password"
                    required
                    placeholder="At least 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-[#18181B] border border-[rgba(255,255,255,0.08)] rounded-[6px] text-xs text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:border-[#00E599] focus:ring-1 focus:ring-[#00E599] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A1A1AA] mb-1">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-4 h-4 text-[#71717A]" />
                  <input
                    type="password"
                    required
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-[#18181B] border border-[rgba(255,255,255,0.08)] rounded-[6px] text-xs text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:border-[#00E599] focus:ring-1 focus:ring-[#00E599] transition-colors"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-3 py-2.5 px-4 rounded-[6px] bg-[#00E599] hover:bg-[#00E599]/90 disabled:opacity-60 text-[#09090B] text-xs font-semibold shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)] transition-all flex items-center justify-center gap-2 group cursor-pointer"
            >
              {loading ? (
                <span>Updating Password...</span>
              ) : (
                <>
                  <span>Reset Password</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="text-center pt-2 border-t border-[rgba(255,255,255,0.08)]">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Sign In</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
