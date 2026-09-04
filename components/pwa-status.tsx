"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Wifi, WifiOff, ShieldCheck, Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function getOnlineServerSnapshot() {
  return true;
}

export default function PwaStatus() {
  const isOnline = useSyncExternalStore(
    subscribeOnline,
    getOnlineSnapshot,
    getOnlineServerSnapshot
  );

  const [swRegistered, setSwRegistered] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Check Service Worker registration
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        if (registrations.length > 0) {
          setSwRegistered(true);
        }
      });

      navigator.serviceWorker.ready.then(() => {
        setSwRegistered(true);
      });
    }

    // PWA Install prompt listener
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Network / SW Badge */}
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
          isOnline
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
            : "bg-amber-500/10 border-amber-500/20 text-amber-400"
        }`}
      >
        {isOnline ? (
          <Wifi className="w-3.5 h-3.5" />
        ) : (
          <WifiOff className="w-3.5 h-3.5" />
        )}
        <span>{isOnline ? "Online" : "Offline (Cached)"}</span>
        {swRegistered && (
          <span className="flex items-center gap-1 text-[10px] pl-1 border-l border-white/10 text-slate-400">
            <ShieldCheck className="w-3 h-3 text-indigo-400" />
            SW Active
          </span>
        )}
      </div>

      {/* PWA Install Button if available */}
      {deferredPrompt && (
        <button
          onClick={handleInstallClick}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/30 shadow-sm transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install App</span>
        </button>
      )}
    </div>
  );
}
