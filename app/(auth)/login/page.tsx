"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Sparkles, Lock, Mail, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (res?.error) {
        setError("Invalid email or password. Please try again.");
        setLoading(false);
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("An unexpected error occurred during sign in.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#09090B] text-[#FAFAFA] relative overflow-hidden">
      <div className="w-full max-w-md z-10">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-[6px] bg-gradient-to-tr from-[#00E599] to-[#10B981] text-[#09090B] shadow-sm mb-4">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#FAFAFA]">
            Welcome to DataBridge <span className="text-[#00E599]">AI</span>
          </h1>
          <p className="text-xs text-[#A1A1AA] mt-1.5 font-mono">
            Sign in to access your multi-tenant analytics dashboard
          </p>
        </div>

        {/* Card */}
        <div className="p-6 sm:p-8 rounded-[10px] bg-[#121215] border border-white/[0.08] shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)] space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-[6px] bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#FAFAFA] mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-[#A1A1AA]" />
                <input
                  type="email"
                  required
                  placeholder="analyst@enterprise.ai"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-[#18181B] border border-white/[0.08] rounded-[6px] text-xs text-[#FAFAFA] placeholder-[#A1A1AA] focus:outline-none focus:border-[#00E599]/60 transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-[#FAFAFA]">
                  Password
                </label>
                <a href="#" className="text-[11px] text-[#00E599] hover:underline font-mono">
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-[#A1A1AA]" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-[#18181B] border border-white/[0.08] rounded-[6px] text-xs text-[#FAFAFA] placeholder-[#A1A1AA] focus:outline-none focus:border-[#00E599]/60 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 rounded-[6px] bg-[#00E599] hover:bg-[#00E599]/90 disabled:opacity-60 text-[#09090B] text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-2 group cursor-pointer"
            >
              {loading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Info */}
          <div className="p-3 rounded-[6px] bg-[#18181B] border border-white/[0.08] text-[11px] text-[#A1A1AA] space-y-1">
            <div className="font-semibold text-[#FAFAFA] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#00E599]" />
              <span>Multi-Tenant Auth.js & MSSQL</span>
            </div>
            <p>New to DataBridge? Register below to auto-provision an organization workspace.</p>
          </div>

          <div className="text-center pt-2 border-t border-white/[0.08]">
            <p className="text-xs text-[#A1A1AA]">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="text-[#00E599] font-medium hover:underline">
                Create Account & Organization
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
