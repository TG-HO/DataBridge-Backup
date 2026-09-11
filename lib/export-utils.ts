"use client";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";

/**
 * Exports tabular record data to CSV format and triggers direct browser download.
 */
export function exportToCsv(data: Record<string, unknown>[], filename: string = "databridge-export") {
  if (!data || data.length === 0) {
    alert("No data available to export.");
    return;
  }

  const keys = Object.keys(data[0]);
  const headerRow = keys.map((k) => `"${k.replace(/"/g, '""')}"`).join(",");

  const rows = data.map((row) =>
    keys
      .map((key) => {
        const val = row[key];
        if (val === null || val === undefined) return '""';
        const str = typeof val === "object" ? JSON.stringify(val) : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      })
      .join(",")
  );

  const csvContent = [headerRow, ...rows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename.replace(/\s+/g, "_")}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Builds an Excel (.xlsx) workbook from data with formatted headers and column widths.
 */
export function exportToExcel(
  data: Record<string, unknown>[],
  sheetName: string = "Analytics",
  filename: string = "databridge-export"
) {
  if (!data || data.length === 0) {
    alert("No data available to export.");
    return;
  }

  const ws = XLSX.utils.json_to_sheet(data);

  // Auto-calculate column widths
  const keys = Object.keys(data[0]);
  const colWidths = keys.map((key) => {
    const maxValLen = Math.max(
      ...data.map((row) => {
        const val = row[key];
        return val !== null && val !== undefined ? String(val).length : 0;
      })
    );
    return { wch: Math.min(Math.max(key.length, maxValLen) + 3, 45) };
  });
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));

  XLSX.writeFile(wb, `${filename.replace(/\s+/g, "_")}.xlsx`);
}

/**
 * Captures the visualizer container using html2canvas-pro and embeds it into a generated jsPDF document
 * complete with Title, Executive Summary, Timestamp, and Data Breakdown table.
 * Supports modern CSS color formats (oklab, oklch) natively.
 */
export async function exportToPdf(
  element: HTMLElement | null,
  options: {
    title: string;
    summary?: string;
    data?: Record<string, unknown>[];
    filename?: string;
  }
) {
  const { title, summary, data, filename = "databridge-report" } = options;

  if (!element) {
    alert("Visualization element not found for PDF capture.");
    return;
  }

  try {
    // 1. Capture the chart / container with high resolution using html2canvas-pro
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#090d16",
    });

    const imgData = canvas.toDataURL("image/png");

    // 2. Initialize jsPDF (A4 portrait: 595.28 x 841.89 pt)
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;
    let currentY = margin;

    // Header Background Accent Bar
    doc.setFillColor(99, 102, 241); // Indigo-500
    doc.rect(margin, currentY, contentWidth, 4, "F");
    currentY += 16;

    // Brand & Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59); // Dark slate
    doc.text("DataBridge AI", margin, currentY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const timestampStr = `Generated: ${new Date().toLocaleString()}`;
    doc.text(timestampStr, pageWidth - margin - doc.getTextWidth(timestampStr), currentY);
    currentY += 22;

    // Report Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(title, margin, currentY);
    currentY += 16;

    // Summary block (if available)
    if (summary) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);

      // Strip markdown headers/bold asterisks for clean PDF text
      const cleanSummary = summary
        .replace(/###?\s+/g, "")
        .replace(/\*\*/g, "")
        .replace(/\*/g, "")
        .replace(/\|/g, " ")
        .slice(0, 400);

      const splitSummary = doc.splitTextToSize(cleanSummary, contentWidth);
      doc.text(splitSummary, margin, currentY);
      currentY += splitSummary.length * 12 + 10;
    }

    // Embed Captured Chart Image
    const imgWidth = contentWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // If image overflows the page, scale down proportionally
    const maxImgHeight = 320;
    const finalImgHeight = Math.min(imgHeight, maxImgHeight);
    const finalImgWidth = (finalImgHeight / imgHeight) * imgWidth;
    const imgX = margin + (contentWidth - finalImgWidth) / 2;

    doc.addImage(imgData, "PNG", imgX, currentY, finalImgWidth, finalImgHeight);
    currentY += finalImgHeight + 20;

    // Data Breakdown Table (first 10 records)
    if (data && data.length > 0) {
      if (currentY > pageHeight - 140) {
        doc.addPage();
        currentY = margin;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text("Data Breakdown (Sample)", margin, currentY);
      currentY += 14;

      const keys = Object.keys(data[0]).slice(0, 6);
      const colWidth = contentWidth / keys.length;

      // Table Header Row
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, currentY, contentWidth, 18, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);

      keys.forEach((key, i) => {
        doc.text(String(key).slice(0, 16), margin + i * colWidth + 4, currentY + 12);
      });
      currentY += 20;

      // Table Rows
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);

      data.slice(0, 10).forEach((row, rowIdx) => {
        if (currentY > pageHeight - 30) {
          doc.addPage();
          currentY = margin;
        }

        if (rowIdx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, currentY - 2, contentWidth, 14, "F");
        }

        keys.forEach((key, colIdx) => {
          const val = row[key];
          const str = val !== null && val !== undefined ? String(val).slice(0, 18) : "-";
          doc.text(str, margin + colIdx * colWidth + 4, currentY + 9);
        });
        currentY += 14;
      });
    }

    // Page Footer
    const totalPages = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `DataBridge AI Analytics Engine • Page ${p} of ${totalPages}`,
        margin,
        pageHeight - 20
      );
    }

    doc.save(`${filename.replace(/\s+/g, "_")}.pdf`);
  } catch (err) {
    console.error("[exportToPdf] Failed to generate PDF report:", err);
    alert("Failed to generate PDF export. Check console for details.");
  }
}

/**
 * Captures and exports the entire multi-widget Dashboard to an executive PDF report.
 */
export async function exportDashboardToPdf(
  element: HTMLElement | null,
  options: {
    dashboardName: string;
    description?: string | null;
    widgets: Array<{
      id: string;
      title: string;
      description?: string | null;
      chartType: string;
    }>;
    widgetDataMap: Record<string, Record<string, unknown>[]>;
    filename?: string;
  }
) {
  const {
    dashboardName,
    description,
    widgets,
    widgetDataMap,
    filename = `${dashboardName}-report`,
  } = options;

  if (!element) {
    alert("Dashboard element not found for PDF capture.");
    return;
  }

  try {
    // 1. Capture the dashboard grid container with html2canvas-pro
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#090d16",
      onclone: (clonedDoc) => {
        // Hide interactive buttons, drag handles, delete icons from export
        const elementsToHide = clonedDoc.querySelectorAll(".drag-handle, button, select");
        elementsToHide.forEach((el) => {
          (el as HTMLElement).style.display = "none";
        });
      },
    });

    // 2. Initialize jsPDF (A4 portrait: 595.28 x 841.89 pt)
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;
    let currentY = margin;

    // Header Accent Bar
    doc.setFillColor(99, 102, 241); // Indigo-500
    doc.rect(margin, currentY, contentWidth, 4, "F");
    currentY += 16;

    // Brand & Timestamp
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text("DataBridge AI", margin, currentY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const timestampStr = `Generated: ${new Date().toLocaleString()}`;
    doc.text(timestampStr, pageWidth - margin - doc.getTextWidth(timestampStr), currentY);
    currentY += 22;

    // Dashboard Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text(dashboardName, margin, currentY);
    currentY += 16;

    // Dashboard Description
    if (description) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      const splitDesc = doc.splitTextToSize(description, contentWidth);
      doc.text(splitDesc, margin, currentY);
      currentY += splitDesc.length * 12 + 8;
    }

    // Executive Metrics Summary Box
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, currentY, contentWidth, 34, 6, 6, "F");
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, currentY, contentWidth, 34, 6, 6, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text(`Total Pinned Widgets: ${widgets.length}`, margin + 14, currentY + 21);

    const chartTypes = Array.from(new Set(widgets.map((w) => w.chartType))).join(", ");
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`Visualization Types: ${chartTypes || "None"}`, margin + 180, currentY + 21);
    currentY += 46;

    // Embed Captured Dashboard Canvas (with automatic page slicing if tall)
    const availableFirstPageHeight = pageHeight - currentY - margin - 20;
    const fullImgHeight = (canvas.height * contentWidth) / canvas.width;

    if (fullImgHeight <= availableFirstPageHeight) {
      // Fits on page 1
      const imgData = canvas.toDataURL("image/png");
      doc.addImage(imgData, "PNG", margin, currentY, contentWidth, fullImgHeight);
      currentY += fullImgHeight + 24;
    } else {
      // Slices canvas into multiple pages
      let sourceY = 0;
      let isFirstSlice = true;

      while (sourceY < canvas.height) {
        const availableHeight = isFirstSlice
          ? availableFirstPageHeight
          : pageHeight - margin * 2 - 30;
        const slicePixelHeight = Math.min(
          canvas.height - sourceY,
          Math.floor((availableHeight * canvas.width) / contentWidth)
        );

        if (slicePixelHeight <= 0) break;

        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = slicePixelHeight;

        const ctx = sliceCanvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(
            canvas,
            0,
            sourceY,
            canvas.width,
            slicePixelHeight,
            0,
            0,
            canvas.width,
            slicePixelHeight
          );

          const sliceImgData = sliceCanvas.toDataURL("image/png");
          const slicePdfHeight = (slicePixelHeight * contentWidth) / canvas.width;

          if (!isFirstSlice) {
            doc.addPage();
            currentY = margin;
          }

          doc.addImage(sliceImgData, "PNG", margin, currentY, contentWidth, slicePdfHeight);
          currentY += slicePdfHeight + 20;
        }

        sourceY += slicePixelHeight;
        isFirstSlice = false;
      }
    }

    // Add Widget Data Breakdown Tables
    for (const widget of widgets) {
      const records = widgetDataMap[widget.id] || [];
      if (records.length === 0) continue;

      if (currentY > pageHeight - 160) {
        doc.addPage();
        currentY = margin;
      }

      // Widget Section Header
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, currentY, contentWidth, 22, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(`${widget.title} [${widget.chartType}]`, margin + 8, currentY + 15);
      currentY += 28;

      const keys = Object.keys(records[0]).slice(0, 6);
      const colWidth = contentWidth / keys.length;

      // Table Columns Header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      keys.forEach((key, i) => {
        doc.text(String(key).slice(0, 16), margin + i * colWidth + 4, currentY + 10);
      });
      currentY += 16;

      // Table Rows (first 6 records)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);

      records.slice(0, 6).forEach((row, rIdx) => {
        if (currentY > pageHeight - 30) {
          doc.addPage();
          currentY = margin;
        }

        if (rIdx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, currentY - 2, contentWidth, 14, "F");
        }

        keys.forEach((key, colIdx) => {
          const val = row[key];
          const str = val !== null && val !== undefined ? String(val).slice(0, 18) : "-";
          doc.text(str, margin + colIdx * colWidth + 4, currentY + 9);
        });
        currentY += 14;
      });

      currentY += 16;
    }

    // Page Footers
    const totalPages = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `DataBridge AI • ${dashboardName} • Page ${p} of ${totalPages}`,
        margin,
        pageHeight - 20
      );
    }

    doc.save(`${filename.replace(/\s+/g, "_")}.pdf`);
  } catch (err) {
    console.error("[exportDashboardToPdf] Failed to export dashboard PDF:", err);
    alert("Failed to export dashboard report. Check console for details.");
  }
}

