import React from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-[#09090B] overflow-y-auto">
      <div className="w-full max-w-md my-8">
        {children}
      </div>
    </div>
  );
}
