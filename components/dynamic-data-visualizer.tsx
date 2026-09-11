"use client";

import { useState, useRef, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Table as TableIcon,
  Download,
  FileSpreadsheet,
  FileText,
  FileCode,
  Pin,
  Maximize2,
  ChevronDown,
  Search,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Layers,
} from "lucide-react";
import { exportToCsv, exportToExcel, exportToPdf } from "@/lib/export-utils";

export type ChartType = "BAR" | "LINE" | "AREA" | "PIE" | "TABLE";

export interface ChartConfig {
  xAxisKey?: string;
  dataKeys?: string[];
  title?: string;
  colors?: string[];
}

export interface DynamicDataVisualizerProps {
  recommendedVisualization?: ChartType | string;
  chartConfig?: ChartConfig;
  data: Record<string, unknown>[];
  summary?: string;
  rawQuery?: string;
  connectionId?: string;
  onPin?: () => void;
  canPin?: boolean;
  isDashboardCard?: boolean;
  className?: string;
}

const PALETTE = [
  "#6366f1", // Indigo
  "#38bdf8", // Sky Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#8b5cf6", // Purple
  "#06b6d4", // Cyan
  "#f97316", // Orange
];

export default function DynamicDataVisualizer({
  recommendedVisualization = "BAR",
  chartConfig,
  data,
  summary,
  onPin,
  canPin = true,
  isDashboardCard = false,
  className = "",
}: DynamicDataVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<"chart" | "table">(
    recommendedVisualization === "TABLE" ? "table" : "chart"
  );
  const [exportOpen, setExportOpen] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [tablePage, setTablePage] = useState(0);
  const rowsPerPage = isDashboardCard ? 5 : 8;

  // Normalize chart type
  const normalizedType: ChartType = useMemo(() => {
    const t = String(recommendedVisualization || "").toUpperCase();
    if (t === "LINE") return "LINE";
    if (t === "AREA") return "AREA";
    if (t === "PIE") return "PIE";
    if (t === "TABLE") return "TABLE";
    return "BAR";
  }, [recommendedVisualization]);

  // Keys discovery
  const { xAxisKey, dataKeys, title } = useMemo(() => {
    const rawX = chartConfig?.xAxisKey;
    const rawKeys = chartConfig?.dataKeys;
    const rawTitle = chartConfig?.title || "Analytics Breakdown";

    if (!data || data.length === 0) {
      return { xAxisKey: "", dataKeys: [], title: rawTitle };
    }

    const allKeys = Object.keys(data[0] || {});

    // Determine X axis (prefer categorical / string / date key)
    let finalX = rawX && allKeys.includes(rawX) ? rawX : "";
    if (!finalX) {
      const candidate = allKeys.find((k) => {
        const val = data[0][k];
        return typeof val === "string" && !/id$/i.test(k);
      });
      finalX = candidate || allKeys[0] || "";
    }

    // Determine numeric data keys
    let finalDataKeys: string[] = [];
    if (Array.isArray(rawKeys) && rawKeys.length > 0) {
      finalDataKeys = rawKeys.filter((k) => allKeys.includes(k));
    }
    if (finalDataKeys.length === 0) {
      finalDataKeys = allKeys.filter((k) => {
        if (k === finalX) return false;
        const val = data[0][k];
        return typeof val === "number" || (!isNaN(Number(val)) && val !== null && val !== "");
      });
    }

    // Fallback: if no numeric key, take the second column
    if (finalDataKeys.length === 0 && allKeys.length > 1) {
      finalDataKeys = [allKeys[1]];
    }

    return {
      xAxisKey: finalX,
      dataKeys: finalDataKeys,
      title: rawTitle,
    };
  }, [chartConfig, data]);

  // Prepared data for numeric series
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((row) => {
      const item: Record<string, unknown> = { ...row };
      dataKeys.forEach((k) => {
        const num = Number(row[k]);
        if (!isNaN(num)) item[k] = num;
      });
      return item;
    });
  }, [data, dataKeys]);

  // Filtered table rows
  const filteredTableData = useMemo(() => {
    if (!data || data.length === 0) return [];
    if (!tableSearch.trim()) return data;
    const query = tableSearch.toLowerCase();
    return data.filter((row) =>
      Object.values(row).some((val) => String(val ?? "").toLowerCase().includes(query))
    );
  }, [data, tableSearch]);

  const totalPages = Math.ceil(filteredTableData.length / rowsPerPage);
  const pagedRows = filteredTableData.slice(
    tablePage * rowsPerPage,
    (tablePage + 1) * rowsPerPage
  );

  // Custom Recharts Dark Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="p-3 rounded-xl bg-slate-950/95 border border-white/20 shadow-2xl backdrop-blur-xl text-xs space-y-1 z-50">
          <p className="font-semibold text-white border-b border-white/10 pb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={`tooltip-${index}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-neutral-300">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: entry.color || entry.fill }}
                />
                <span className="capitalize">{entry.name}:</span>
              </span>
              <span className="font-mono font-bold text-white">
                {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderChart = () => {
    if (!chartData || chartData.length === 0 || dataKeys.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-52 text-neutral-400 text-xs gap-2">
          <TableIcon className="w-8 h-8 text-neutral-500" />
          <span>Insufficient categorical or numerical data for chart visualization.</span>
          <button
            onClick={() => setViewMode("table")}
            className="px-3 py-1 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 text-xs cursor-pointer"
          >
            Switch to Data Table
          </button>
        </div>
      );
    }

    const height = isDashboardCard ? 240 : 280;

    switch (normalizedType) {
      case "LINE":
        return (
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
              <XAxis
                dataKey={xAxisKey}
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                tickFormatter={(val) => String(val).slice(0, 12)}
              />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                iconType="circle"
              />
              {dataKeys.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={2.5}
                  dot={{ fill: PALETTE[i % PALETTE.length], r: 3 }}
                  activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );

      case "AREA":
        return (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <defs>
                {dataKeys.map((key, i) => (
                  <linearGradient
                    key={`grad-${key}`}
                    id={`area-grad-${key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.6} />
                    <stop offset="95%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
              <XAxis
                dataKey={xAxisKey}
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                tickFormatter={(val) => String(val).slice(0, 12)}
              />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                iconType="circle"
              />
              {dataKeys.map((key, i) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill={`url(#area-grad-${key})`}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        );

      case "PIE":
        const primaryDataKey = dataKeys[0];
        const pieData = chartData.slice(0, 8); // Top 8 slices for readability
        return (
          <ResponsiveContainer width="100%" height={height}>
            <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                iconType="circle"
              />
              <Pie
                data={pieData}
                dataKey={primaryDataKey}
                nameKey={xAxisKey}
                cx="50%"
                cy="50%"
                innerRadius={isDashboardCard ? 45 : 60}
                outerRadius={isDashboardCard ? 75 : 95}
                paddingAngle={3}
                label={({ percent }: any) => `${((percent || 0) * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {pieData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={PALETTE[index % PALETTE.length]}
                    stroke="#090d16"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        );

      case "BAR":
      default:
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
              <XAxis
                dataKey={xAxisKey}
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                tickFormatter={(val) => String(val).slice(0, 12)}
              />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                iconType="circle"
              />
              {dataKeys.map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={PALETTE[i % PALETTE.length]}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={45}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );
    }
  };

  return (
    <div
      ref={containerRef}
      className={`rounded-2xl border border-white/10 bg-slate-950/70 backdrop-blur-xl shadow-2xl p-4 sm:p-5 flex flex-col gap-3 transition-all ${className}`}
    >
      {/* Visualizer Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            {normalizedType === "LINE" && <LineChartIcon className="w-4 h-4" />}
            {normalizedType === "AREA" && <TrendingUp className="w-4 h-4" />}
            {normalizedType === "PIE" && <PieChartIcon className="w-4 h-4" />}
            {normalizedType === "BAR" && <BarChart3 className="w-4 h-4" />}
            {normalizedType === "TABLE" && <TableIcon className="w-4 h-4" />}
          </div>
          <div className="truncate">
            <h4 className="text-xs font-bold text-white tracking-tight truncate">{title}</h4>
            <span className="text-[10px] text-slate-400 font-mono">
              {data.length} records • {normalizedType} visualization
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Chart / Table View Toggle */}
          <div className="flex items-center p-0.5 rounded-xl bg-white/5 border border-white/10">
            <button
              type="button"
              onClick={() => setViewMode("chart")}
              className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                viewMode === "chart"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
              title="Switch to Chart View"
            >
              <BarChart3 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                viewMode === "table"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
              title="Switch to Data Table"
            >
              <TableIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Export Dropdown Menu (FR-13) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportOpen(!exportOpen)}
              className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
              title="Export Dataset & Visualizations"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline text-[11px] font-medium">Export</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {exportOpen && (
              <div className="absolute right-0 mt-2 w-48 p-1.5 rounded-2xl bg-slate-950/95 border border-white/15 shadow-2xl z-50 space-y-1 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-100">
                <button
                  type="button"
                  onClick={() => {
                    setExportOpen(false);
                    exportToCsv(data, title);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs text-slate-200 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                >
                  <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                  <div>
                    <div className="font-semibold text-xs">Export to CSV</div>
                    <div className="text-[9px] text-slate-400 font-mono">Raw data .csv</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExportOpen(false);
                    exportToExcel(data, "Analytics", title);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs text-slate-200 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
                  <div>
                    <div className="font-semibold text-xs">Export to Excel</div>
                    <div className="text-[9px] text-slate-400 font-mono">Styled .xlsx sheet</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExportOpen(false);
                    exportToPdf(containerRef.current, {
                      title,
                      summary,
                      data,
                      filename: title,
                    });
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs text-slate-200 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-rose-400" />
                  <div>
                    <div className="font-semibold text-xs">Export to PDF</div>
                    <div className="text-[9px] text-slate-400 font-mono">Full Executive PDF</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Pin to Dashboard Button (FR-12) */}
          {canPin && onPin && (
            <button
              type="button"
              onClick={onPin}
              className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
              title="Pin this chart to an organization dashboard"
            >
              <Pin className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">Pin to Dashboard</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Visualizer Area */}
      <div className="w-full min-h-[200px] relative">
        {viewMode === "chart" ? (
          renderChart()
        ) : (
          /* Data Table View */
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter records..."
                  value={tableSearch}
                  onChange={(e) => {
                    setTableSearch(e.target.value);
                    setTablePage(0);
                  }}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-black/50 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Showing {filteredTableData.length} records
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 shadow-inner">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900/90 border-b border-white/10">
                    {data.length > 0 &&
                      Object.keys(data[0]).map((key) => (
                        <th
                          key={key}
                          className="px-3.5 py-2.5 text-[10px] font-bold text-indigo-300 uppercase tracking-wider font-mono whitespace-nowrap"
                        >
                          {key}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {pagedRows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-indigo-500/10 transition-colors">
                      {Object.keys(data[0]).map((k) => (
                        <td
                          key={k}
                          className="px-3.5 py-2 text-xs font-mono text-slate-300 whitespace-nowrap"
                        >
                          {row[k] !== null && row[k] !== undefined ? String(row[k]) : "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-[11px] text-slate-400 font-mono">
                  Page {tablePage + 1} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={tablePage === 0}
                    onClick={() => setTablePage((p) => Math.max(0, p - 1))}
                    className="p-1 rounded-lg border border-white/10 bg-white/5 text-slate-300 disabled:opacity-30 hover:bg-white/10 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={tablePage >= totalPages - 1}
                    onClick={() => setTablePage((p) => Math.min(totalPages - 1, p + 1))}
                    className="p-1 rounded-lg border border-white/10 bg-white/5 text-slate-300 disabled:opacity-30 hover:bg-white/10 cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
