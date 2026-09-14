"use client";

import { useState, useEffect } from "react";
import { X, Pin, Plus, Check, Loader2, LayoutDashboard, Database } from "lucide-react";
import { getDashboards, pinWidgetToDashboard } from "@/app/actions/dashboard";
import Link from "next/link";

interface PinWidgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  widget: {
    title: string;
    chartType: string;
    chartConfig: any;
    rawQuery?: string;
    connectionId?: string;
    data?: any[];
  } | null;
}

export default function PinWidgetModal({ isOpen, onClose, widget }: PinWidgetModalProps) {
  const [dashboards, setDashboards] = useState<{ id: string; name: string }[]>([]);
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>("");
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (isOpen && widget) {
      setTitle(widget.title || "Analytics Widget");
      setDescription("");
      setToast(null);
      setIsCreatingNew(false);
      setNewDashboardName("");

      // Fetch user's dashboards
      setLoading(true);
      getDashboards()
        .then((res) => {
          if (res.success && res.dashboards.length > 0) {
            setDashboards(res.dashboards);
            setSelectedDashboardId(res.dashboards[0].id);
          } else {
            setIsCreatingNew(true);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, widget]);

  if (!isOpen || !widget) return null;

  const handlePin = async () => {
    if (!title.trim()) {
      setToast({ type: "error", text: "Widget title is required." });
      return;
    }

    if (isCreatingNew && !newDashboardName.trim()) {
      setToast({ type: "error", text: "New dashboard name is required." });
      return;
    }

    setSaving(true);
    setToast(null);

    try {
      const res = await pinWidgetToDashboard({
        dashboardId: isCreatingNew ? undefined : selectedDashboardId,
        newDashboardName: isCreatingNew ? newDashboardName.trim() : undefined,
        title: title.trim(),
        description: description.trim() || undefined,
        chartType: widget.chartType,
        chartConfig: widget.chartConfig,
        rawQuery: widget.rawQuery || "",
        connectionId: widget.connectionId || "",
        cachedData: widget.data,
      });

      if (res.success) {
        setToast({
          type: "success",
          text: `Pinned successfully to ${
            isCreatingNew
              ? newDashboardName
              : dashboards.find((d) => d.id === selectedDashboardId)?.name || "Dashboard"
          }!`,
        });
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setToast({ type: "error", text: res.error || "Failed to pin widget." });
      }
    } catch (err) {
      setToast({
        type: "error",
        text: err instanceof Error ? err.message : "Error saving widget to dashboard.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-md p-6 rounded-[10px] bg-[#121215] border border-white/[0.08] shadow-[0_8px_24px_-4px_rgba(0,0,0,0.45)] text-[#FAFAFA] space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[6px] bg-[#00E599]/15 border border-[#00E599]/30 flex items-center justify-center text-[#00E599]">
              <Pin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-[#FAFAFA]">Pin to Dashboard</h3>
              <p className="text-[11px] text-[#A1A1AA] font-mono">
                Add this {widget.chartType} chart to an organization workspace
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[6px] text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#18181B] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="space-y-4 text-xs">
          {/* Dashboard Selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-semibold text-[#FAFAFA]">Target Dashboard</label>
              <button
                type="button"
                onClick={() => setIsCreatingNew(!isCreatingNew)}
                className="text-[11px] text-[#00E599] hover:text-[#00E599]/80 transition-colors cursor-pointer flex items-center gap-1 font-medium font-mono"
              >
                {isCreatingNew ? "Select Existing" : "+ New Dashboard"}
              </button>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 p-2.5 rounded-[6px] bg-[#18181B] border border-white/[0.08] text-[#A1A1AA]">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00E599]" />
                <span>Loading dashboards...</span>
              </div>
            ) : isCreatingNew ? (
              <input
                type="text"
                placeholder="e.g. Q3 Sales & Executive KPI"
                value={newDashboardName}
                onChange={(e) => setNewDashboardName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-[6px] bg-[#18181B] border border-white/[0.08] text-[#FAFAFA] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#00E599]/60 font-sans"
              />
            ) : (
              <select
                value={selectedDashboardId}
                onChange={(e) => setSelectedDashboardId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-[6px] bg-[#18181B] border border-white/[0.08] text-[#FAFAFA] focus:outline-none focus:border-[#00E599]/60 font-sans cursor-pointer"
              >
                {dashboards.map((dash) => (
                  <option key={dash.id} value={dash.id} className="bg-[#18181B] text-[#FAFAFA]">
                    {dash.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Widget Title */}
          <div>
            <label className="block font-semibold text-[#FAFAFA] mb-1.5">Widget Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Top 10 Customers by Revenue"
              className="w-full px-3.5 py-2.5 rounded-[6px] bg-[#18181B] border border-white/[0.08] text-[#FAFAFA] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#00E599]/60 font-sans"
            />
          </div>

          {/* Widget Description (Optional) */}
          <div>
            <label className="block font-semibold text-[#FAFAFA] mb-1.5">
              Description <span className="text-[#A1A1AA] font-normal">(Optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief summary or context for this metric..."
              className="w-full px-3.5 py-2 rounded-[6px] bg-[#18181B] border border-white/[0.08] text-[#FAFAFA] placeholder:text-[#A1A1AA] focus:outline-none focus:border-[#00E599]/60 font-sans resize-none"
            />
          </div>

          {/* Query Preview Badge */}
          {widget.rawQuery && (
            <div className="p-2.5 rounded-[6px] bg-[#18181B] border border-white/[0.08] text-[11px] font-mono text-[#A1A1AA] truncate">
              <span className="text-[#A1A1AA]/60 block text-[9px] uppercase font-bold">
                Stored Executable Query:
              </span>
              <span className="text-[#00E599] truncate block">{widget.rawQuery}</span>
            </div>
          )}

          {/* Toast feedback */}
          {toast && (
            <div
              className={`p-3 rounded-[6px] border text-xs flex items-center gap-2 ${
                toast.type === "success"
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                  : "bg-rose-500/15 border-rose-500/30 text-rose-300"
              }`}
            >
              {toast.type === "success" ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <X className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{toast.text}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.08]">
          <Link
            href="/dashboard"
            onClick={onClose}
            className="text-[11px] text-[#A1A1AA] hover:text-[#FAFAFA] flex items-center gap-1 transition-colors"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Go to Dashboard</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-[6px] border border-white/[0.08] bg-[#18181B] hover:bg-[#27272A] text-xs text-[#FAFAFA] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePin}
              disabled={saving}
              className="px-5 py-2 rounded-[6px] bg-[#00E599] hover:bg-[#00E599]/90 disabled:opacity-50 text-[#09090B] text-xs font-semibold shadow-sm flex items-center gap-2 transition-all cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Pinning...</span>
                </>
              ) : (
                <>
                  <Pin className="w-3.5 h-3.5" />
                  <span>Pin Widget</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
