import React from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-[#090d16] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-950/25 via-[#090d16] to-[#04060a] overflow-y-auto">
      <div className="w-full max-w-md my-8">
        {children}
      </div>
    </div>
  );
}
