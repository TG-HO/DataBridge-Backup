"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  ResponsiveGridLayout,
  Layout,
  LayoutItem,
  useContainerWidth,
} from "react-grid-layout";
import {
  LayoutDashboard,
  Plus,
  RefreshCw,
  Trash2,
  GripVertical,
  Layers,
  Sparkles,
  ExternalLink,
  ChevronDown,
  Check,
  AlertCircle,
  FileDown,
} from "lucide-react";
import Link from "next/link";
import DynamicDataVisualizer, { ChartType, ChartConfig } from "@/components/dynamic-data-visualizer";
import {
  updateWidgetLayouts,
  deleteWidget,
  refreshWidgetData,
  createDashboard,
} from "@/app/actions/dashboard";
import { exportDashboardToPdf } from "@/lib/export-utils";

interface WidgetRecord {
  id: string;
  dashboardId: string;
  title: string;
  description?: string | null;
  chartType: string;
  chartConfig: string;
  rawQuery: string;
  connectionId: string;
  layout: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DashboardRecord {
  id: string;
  orgId: string;
  name: string;
  description?: string | null;
}

interface DashboardGridProps {
  initialDashboard: DashboardRecord;
  dashboards: DashboardRecord[];
  initialWidgets: WidgetRecord[];
}

export default function DashboardGrid({
  initialDashboard,
  dashboards: initialDashboardsList,
  initialWidgets,
}: DashboardGridProps) {
  const { width, containerRef, mounted } = useContainerWidth();
  const [currentDashboard, setCurrentDashboard] = useState<DashboardRecord>(initialDashboard);
  const [dashboardsList, setDashboardsList] = useState<DashboardRecord[]>(initialDashboardsList);
  const [widgets, setWidgets] = useState<WidgetRecord[]>(initialWidgets);
  const [widgetDataMap, setWidgetDataMap] = useState<Record<string, Record<string, unknown>[]>>({});
  const [refreshingWidgetId, setRefreshingWidgetId] = useState<string | null>(null);
  const [refreshStatusMap, setRefreshStatusMap] = useState<Record<string, string>>({});
  const [isCreatingDash, setIsCreatingDash] = useState(false);
  const [newDashName, setNewDashName] = useState("");
  const [isSavingDash, setIsSavingDash] = useState(false);
  const [isExportingDashboard, setIsExportingDashboard] = useState(false);
  const [saveLayoutNotice, setSaveLayoutNotice] = useState(false);
  const layoutSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dashboardExportRef = useRef<HTMLDivElement>(null);

  // Initialize sample / fallback data for widgets on mount
  useEffect(() => {
    widgets.forEach((w) => {
      // Auto-load data for widget if empty
      if (!widgetDataMap[w.id]) {
        handleRefreshWidget(w.id);
      }
    });
  }, [widgets]);

  // Construct react-grid-layout items
  const layouts = useMemo(() => {
    const lgLayout: LayoutItem[] = widgets.map((w, index) => {
      let parsed = { x: (index * 6) % 12, y: Math.floor(index / 2) * 4, w: 6, h: 4, minW: 4, minH: 3 };
      try {
        if (w.layout) {
          const l = JSON.parse(w.layout);
          parsed = { ...parsed, ...l };
        }
      } catch {}
      return {
        i: w.id,
        x: parsed.x ?? 0,
        y: parsed.y ?? 0,
        w: parsed.w ?? 6,
        h: parsed.h ?? 4,
        minW: parsed.minW ?? 4,
        minH: parsed.minH ?? 3,
      };
    });

    return { lg: lgLayout, md: lgLayout, sm: lgLayout };
  }, [widgets]);

  // Handle Drag / Resize layout changes and persist to MSSQL (FR-12)
  const handleLayoutChange = useCallback(
    (currentLayout: Layout) => {
      if (layoutSaveTimeoutRef.current) {
        clearTimeout(layoutSaveTimeoutRef.current);
      }

      layoutSaveTimeoutRef.current = setTimeout(async () => {
        const payload = currentLayout.map((item: LayoutItem) => ({
          id: item.i,
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
        }));

        const res = await updateWidgetLayouts(currentDashboard.id, payload);
        if (res.success) {
          setSaveLayoutNotice(true);
          setTimeout(() => setSaveLayoutNotice(false), 2000);
        }
      }, 500);
    },
    [currentDashboard.id]
  );

  // Re-runs stored query against target database connection (FR-12 Live Data Refresh)
  const handleRefreshWidget = async (widgetId: string) => {
    setRefreshingWidgetId(widgetId);
    try {
      const res = await refreshWidgetData(widgetId);
      if (res.success && res.data) {
        setWidgetDataMap((prev) => ({
          ...prev,
          [widgetId]: res.data as Record<string, unknown>[],
        }));
        setRefreshStatusMap((prev) => ({
          ...prev,
          [widgetId]: `Refreshed ${res.refreshedAt || new Date().toLocaleTimeString()}`,
        }));
      } else {
        setRefreshStatusMap((prev) => ({
          ...prev,
          [widgetId]: res.error || "Refresh failed",
        }));
      }
    } catch (err) {
      console.error("Widget refresh error:", err);
    } finally {
      setRefreshingWidgetId(null);
    }
  };

  // Delete widget
  const handleDeleteWidget = async (widgetId: string) => {
    if (!confirm("Are you sure you want to remove this widget from the dashboard?")) return;
    setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
    await deleteWidget(widgetId);
  };

  // Create new dashboard inline
  const handleCreateNewDashboard = async () => {
    if (!newDashName.trim()) return;
    setIsSavingDash(true);
    try {
      const res = await createDashboard(newDashName.trim());
      if (res.success && res.dashboard) {
        setDashboardsList((prev) => [...prev, res.dashboard!]);
        setCurrentDashboard(res.dashboard!);
        setWidgets([]);
        setIsCreatingDash(false);
        setNewDashName("");
      }
    } finally {
      setIsSavingDash(false);
    }
  };

  // Export whole dashboard to PDF report
  const handleExportDashboardPdf = async () => {
    const el = dashboardExportRef.current || containerRef.current;
    if (!el) {
      alert("Dashboard container not available for export.");
      return;
    }
    setIsExportingDashboard(true);
    try {
      await exportDashboardToPdf(el, {
        dashboardName: currentDashboard.name,
        description: currentDashboard.description,
        widgets: widgets.map((w) => ({
          id: w.id,
          title: w.title,
          description: w.description,
          chartType: w.chartType,
        })),
        widgetDataMap,
      });
    } catch (err) {
      console.error("Dashboard PDF export error:", err);
    } finally {
      setIsExportingDashboard(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#090d16] text-white p-4 sm:p-6 space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-3xl bg-slate-950/70 border border-white/10 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
            <LayoutDashboard className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">
                {currentDashboard.name}
              </h2>
              {saveLayoutNotice && (
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 animate-in fade-in duration-150">
                  Layout Saved
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-400">
              {currentDashboard.description || "Draggable, customizable real-time analytics grid"}
            </p>
          </div>
        </div>

        {/* Dashboard Actions */}
        <div className="flex items-center gap-2.5">
          {/* Dashboard Switcher */}
          {dashboardsList.length > 1 && (
            <select
              value={currentDashboard.id}
              onChange={(e) => {
                const target = dashboardsList.find((d) => d.id === e.target.value);
                if (target) {
                  window.location.href = `/dashboard?id=${target.id}`;
                }
              }}
              className="px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-sans cursor-pointer"
            >
              {dashboardsList.map((d) => (
                <option key={d.id} value={d.id} className="bg-slate-900 text-white">
                  {d.name}
                </option>
              ))}
            </select>
          )}

          {/* New Dashboard Button */}
          <button
            type="button"
            onClick={() => setIsCreatingDash(true)}
            className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer font-medium"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">New Dashboard</span>
          </button>

          {/* Export Dashboard PDF Report Button */}
          {widgets.length > 0 && (
            <button
              type="button"
              onClick={handleExportDashboardPdf}
              disabled={isExportingDashboard}
              className="px-3 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-xs text-purple-200 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer font-medium disabled:opacity-50"
              title="Export the entire dashboard as a professional PDF report"
            >
              {isExportingDashboard ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                  <span>Exporting PDF...</span>
                </>
              ) : (
                <>
                  <FileDown className="w-3.5 h-3.5 text-purple-400" />
                  <span>Export Report (PDF)</span>
                </>
              )}
            </button>
          )}

          {/* Query Console Link */}
          <Link
            href="/"
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Query Console</span>
          </Link>
        </div>
      </div>

      {/* New Dashboard Modal / Prompt */}
      {isCreatingDash && (
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-indigo-500/30 shadow-xl flex flex-wrap items-center gap-3 animate-in fade-in duration-100">
          <input
            type="text"
            placeholder="New Dashboard Name..."
            value={newDashName}
            onChange={(e) => setNewDashName(e.target.value)}
            className="flex-1 min-w-[220px] px-3.5 py-2 rounded-xl bg-black/60 border border-white/15 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="button"
            onClick={handleCreateNewDashboard}
            disabled={isSavingDash || !newDashName.trim()}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white transition-all cursor-pointer"
          >
            {isSavingDash ? "Creating..." : "Create Dashboard"}
          </button>
          <button
            type="button"
            onClick={() => setIsCreatingDash(false)}
            className="px-3 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-xs text-slate-400 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Empty State */}
      {widgets.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md w-full p-8 rounded-3xl bg-slate-950/60 border border-white/10 text-center space-y-4 backdrop-blur-xl shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/15 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400">
              <Layers className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white tracking-tight">
                No Pinned Widgets Yet
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Run questions in the Query Console and click &ldquo;Pin to Dashboard&rdquo; on any
                generated chart to build your custom business workspace.
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-all shadow-lg shadow-indigo-600/30"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Go to Query Console</span>
            </Link>
          </div>
        </div>
      ) : (
        /* Draggable & Resizable Grid (FR-12) */
        <div ref={dashboardExportRef} className="w-full">
          <div ref={containerRef} className="w-full">
            {mounted && (
              <ResponsiveGridLayout
              width={width}
              className="layout"
              layouts={layouts}
              breakpoints={{ lg: 1200, md: 996, sm: 768 }}
              cols={{ lg: 12, md: 10, sm: 6 }}
              rowHeight={100}
              dragConfig={{ handle: ".drag-handle" }}
              onLayoutChange={handleLayoutChange}
            >
          {widgets.map((widget) => {
            let parsedConfig: ChartConfig = {};
            try {
              if (widget.chartConfig) parsedConfig = JSON.parse(widget.chartConfig);
            } catch {}

            const records = widgetDataMap[widget.id] || [];
            const isRefreshing = refreshingWidgetId === widget.id;
            const refreshNotice = refreshStatusMap[widget.id];

            return (
              <div key={widget.id} className="h-full">
                <div className="h-full flex flex-col rounded-2xl border border-white/10 bg-slate-950/80 backdrop-blur-xl shadow-2xl overflow-hidden group">
                  {/* Card Drag Header */}
                  <div className="flex items-center justify-between px-3.5 py-2.5 bg-black/50 border-b border-white/10 shrink-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div
                        className="drag-handle cursor-grab active:cursor-grabbing p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                        title="Drag to reposition widget"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>

                      <div className="truncate min-w-0">
                        <h4 className="text-xs font-bold text-white tracking-tight truncate">
                          {widget.title}
                        </h4>
                        {refreshNotice && (
                          <span className="text-[9px] text-slate-400 font-mono block truncate">
                            {refreshNotice}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-indigo-300 border border-white/10 uppercase">
                        {widget.chartType}
                      </span>

                      {/* Refresh Data Button (FR-12) */}
                      <button
                        type="button"
                        onClick={() => handleRefreshWidget(widget.id)}
                        disabled={isRefreshing}
                        className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        title="Re-run query against target database connection"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-400" : ""}`}
                        />
                      </button>

                      {/* Delete Widget Button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteWidget(widget.id)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Remove widget"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Card Body with DynamicDataVisualizer */}
                  <div className="flex-1 min-h-0 overflow-y-auto p-2">
                    <DynamicDataVisualizer
                      recommendedVisualization={widget.chartType}
                      chartConfig={parsedConfig}
                      data={records}
                      summary={widget.description || undefined}
                      rawQuery={widget.rawQuery}
                      connectionId={widget.connectionId}
                      canPin={false}
                      isDashboardCard={true}
                      className="border-none bg-transparent shadow-none p-1"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </ResponsiveGridLayout>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
