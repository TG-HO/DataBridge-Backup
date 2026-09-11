"use client";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

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
 * Captures the visualizer container using html2canvas and embeds it into a generated jsPDF document
 * complete with Title, Executive Summary, Timestamp, and Data Breakdown table.
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
    // 1. Capture the chart / container with high resolution
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
