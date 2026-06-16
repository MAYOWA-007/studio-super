import { jsPDF } from "jspdf";
import type { Production } from "./types";
import { crewLabels } from "./storage";
import { buildExportSections, type ExportNoteRow } from "./exportSections";
import { compactDate, formatZonedDateTime } from "./time";

export type ExportFont = "modern" | "classic" | "mono";

interface ExportOptions {
  font?: ExportFont;
}

const page = {
  width: 215.9,
  margin: 14,
  headerHeight: 34
};

const colors = {
  ink: [20, 24, 28] as const,
  muted: [98, 108, 118] as const,
  panel: [247, 245, 240] as const,
  line: [217, 221, 226] as const,
  header: [8, 10, 13] as const,
  red: [225, 6, 0] as const,
  gold: [202, 163, 77] as const,
  event: [39, 115, 130] as const,
  issue: [178, 36, 30] as const
};

function productionFileStem(production: Production) {
  return (production.shortName || production.title || production.code || "session")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadBlob(filename: string, mime: string, content: string | BlobPart[]) {
  const blob = new Blob(Array.isArray(content) ? content : [content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function exportedNoteCount(sections: ReturnType<typeof buildExportSections>) {
  return sections.logRows.length;
}

export function exportCsv(production: Production) {
  const sections = buildExportSections(production);
  const rows = [
    ["Production", production.title || "Untitled Session"],
    ["Short Name", production.shortName],
    ["Session Date", compactDate(production.sessionDate)],
    ["Recording Path", production.recordingPath],
    ["Exported Notes", String(exportedNoteCount(sections))],
    ["Exported", formatZonedDateTime(new Date().toISOString(), "America/Los_Angeles")],
    [],
    ["Time", "Kind", "Event", "Note", "Operator"],
    ...sections.logRows.map((row) => [row.time, row.kind, row.eventType, row.note, row.operatorName])
  ];

  const csv = rows.map((row) => row.map((cell) => csvEscape(cell || "")).join(",")).join("\n");
  downloadBlob(`${productionFileStem(production)}-editor-handoff.csv`, "text/csv;charset=utf-8", csv);
}

function mdRows(rows: ExportNoteRow[]) {
  if (rows.length === 0) {
    return "_No logged events yet._";
  }

  return [
    "| Time | Kind | Event | Note | Operator |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map((row) =>
      [row.time, row.kind, row.eventType, row.note || "-", row.operatorName || "-"]
        .map((cell) => cell.replace(/\|/g, "\\|").replace(/\n/g, "<br>"))
        .join(" | ")
    )
  ].join("\n");
}

export function buildMarkdown(production: Production) {
  const sections = buildExportSections(production);
  const crew = Object.entries(crewLabels)
    .map(([role, label]) => {
      const value = production.crew[role as keyof typeof production.crew];
      return value ? `- **${label}:** ${value}` : "";
    })
    .filter(Boolean)
    .join("\n");

  return `# ${production.title || "Untitled Session"}

**Session date:** ${compactDate(production.sessionDate)}
**Short name:** ${production.shortName || "-"}
**Duration:** ${production.studioDuration || "-"}
**Recording path:** ${production.recordingPath || "-"}
**Exported:** ${formatZonedDateTime(new Date().toISOString(), "America/Los_Angeles")}

## Crew

${crew || "_No crew entered._"}

## Chronological Log

${mdRows(sections.logRows)}

## Manual Notes

${sections.manualNotes || "_No manual notes entered._"}
`;
}

export function exportMarkdown(production: Production, _options: ExportOptions = {}) {
  downloadBlob(
    `${productionFileStem(production)}-editor-handoff.md`,
    "text/markdown;charset=utf-8",
    buildMarkdown(production)
  );
}

export function exportProductionBackup(production: Production) {
  downloadBlob(
    `${productionFileStem(production)}-session-backup.json`,
    "application/json;charset=utf-8",
    JSON.stringify(
      {
        schema: "STUDIO_SUPER_SESSION_V1",
        exportedAtUtc: new Date().toISOString(),
        production
      },
      null,
      2
    )
  );
}

export function exportWorkspaceBackup(productions: Production[]) {
  downloadBlob(
    "studio-super-workspace-backup.json",
    "application/json;charset=utf-8",
    JSON.stringify(
      {
        schema: "STUDIO_SUPER_WORKSPACE_V1",
        exportedAtUtc: new Date().toISOString(),
        productions
      },
      null,
      2
    )
  );
}

function setDocColor(doc: jsPDF, color: readonly [number, number, number], target: "text" | "fill" | "draw") {
  if (target === "text") doc.setTextColor(color[0], color[1], color[2]);
  if (target === "fill") doc.setFillColor(color[0], color[1], color[2]);
  if (target === "draw") doc.setDrawColor(color[0], color[1], color[2]);
}

function pdfFont(font: ExportFont | undefined) {
  if (font === "classic") return "times";
  if (font === "mono") return "courier";
  return "helvetica";
}

function ensurePage(doc: jsPDF, y: number, needed = 22) {
  if (y + needed <= 264) {
    return y;
  }
  doc.addPage();
  return page.margin;
}

function wrapParagraph(doc: jsPDF, paragraph: string, maxWidth: number) {
  const text = paragraph.trimEnd();
  if (!text) return [""];
  return doc.splitTextToSize(text, maxWidth) as string[];
}

function wrappedText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight = 4.8) {
  const paragraphs = (text || "N/A").split(/\r?\n/);
  let cursor = y;

  for (const paragraph of paragraphs) {
    const isBullet = paragraph.startsWith("- ");
    const body = isBullet ? paragraph.slice(2) : paragraph;
    const lines = wrapParagraph(doc, body, isBullet ? maxWidth - 7 : maxWidth);

    lines.forEach((line, index) => {
      cursor = ensurePage(doc, cursor, lineHeight + 2);
      if (isBullet && index === 0) {
        doc.text("-", x, cursor);
      }
      doc.text(line || " ", x + (isBullet ? 5 : 0), cursor);
      cursor += lineHeight;
    });

    if (!paragraph.trim()) {
      cursor += lineHeight * 0.5;
    }
  }

  return cursor;
}

function writeHeader(doc: jsPDF, production: Production, baseFont: string) {
  setDocColor(doc, colors.header, "fill");
  doc.rect(0, 0, page.width, page.headerHeight, "F");
  setDocColor(doc, colors.red, "fill");
  doc.rect(0, page.headerHeight - 3, page.width * 0.7, 3, "F");
  setDocColor(doc, colors.gold, "fill");
  doc.rect(page.width * 0.7, page.headerHeight - 3, page.width * 0.3, 3, "F");

  setDocColor(doc, [255, 255, 255], "text");
  doc.setFont(baseFont, "bold");
  doc.setFontSize(15);
  const titleLines = doc.splitTextToSize(production.title || "Untitled Session", 142) as string[];
  titleLines.slice(0, 2).forEach((line, index) => {
    doc.text(line, page.margin, 12 + index * 6);
  });

  doc.setFont(baseFont, "normal");
  doc.setFontSize(8.5);
  doc.text("Editor handoff", page.margin, 28);
  doc.text(production.shortName || production.code || "session", page.width - page.margin, 15, { align: "right" });
  doc.text(compactDate(production.sessionDate), page.width - page.margin, 24, { align: "right" });
}

function writePill(doc: jsPDF, label: string, value: string, x: number, y: number, width: number, baseFont: string) {
  setDocColor(doc, colors.panel, "fill");
  setDocColor(doc, colors.line, "draw");
  doc.roundedRect(x, y, width, 16, 2.5, 2.5, "FD");
  setDocColor(doc, colors.muted, "text");
  doc.setFont(baseFont, "bold");
  doc.setFontSize(7);
  doc.text(label.toUpperCase(), x + 4, y + 5.3);
  setDocColor(doc, colors.ink, "text");
  doc.setFontSize(8.6);
  doc.text(value || "N/A", x + 4, y + 11.6, { maxWidth: width - 8 });
}

function writeSectionTitle(doc: jsPDF, title: string, y: number, baseFont: string) {
  const cursor = ensurePage(doc, y, 14);
  setDocColor(doc, colors.red, "fill");
  doc.rect(page.margin, cursor - 1.4, 2.5, 6.4, "F");
  setDocColor(doc, colors.ink, "text");
  doc.setFont(baseFont, "bold");
  doc.setFontSize(11.5);
  doc.text(title, page.margin + 6, cursor + 4);
  return cursor + 12;
}

function writeSection(doc: jsPDF, title: string, body: string, y: number, baseFont: string) {
  let cursor = writeSectionTitle(doc, title, y, baseFont);
  doc.setFont(baseFont, "normal");
  doc.setFontSize(9.2);
  setDocColor(doc, colors.ink, "text");
  cursor = wrappedText(doc, body, page.margin, cursor, 186, 4.8);
  return cursor + 6;
}

function writeCrew(doc: jsPDF, production: Production, y: number, baseFont: string) {
  let cursor = writeSectionTitle(doc, "Crew", y, baseFont);
  const entries = Object.entries(crewLabels).map(([role, label]) => ({
    label,
    value: production.crew[role as keyof typeof production.crew]
  }));
  const colWidth = 58;

  entries.forEach((entry, index) => {
    const x = page.margin + (index % 3) * (colWidth + 5);
    if (index > 0 && index % 3 === 0) {
      cursor += 19;
    }
    cursor = ensurePage(doc, cursor, 16);
    writePill(doc, entry.label, entry.value, x, cursor, colWidth, baseFont);
  });

  return cursor + 24;
}

function writeNotesTable(doc: jsPDF, title: string, rows: ExportNoteRow[], y: number, emptyText: string, baseFont: string) {
  let cursor = writeSectionTitle(doc, title, y, baseFont);
  const x = page.margin;
  const tableWidth = page.width - page.margin * 2;
  const timeX = x + 4;
  const kindX = x + 26;
  const eventX = x + 46;
  const noteX = x + 84;
  const operatorX = x + tableWidth - 4;
  const noteWidth = 68;

  if (rows.length === 0) {
    doc.setFont(baseFont, "normal");
    doc.setFontSize(8.6);
    setDocColor(doc, colors.muted, "text");
    doc.text(emptyText, x, cursor);
    return cursor + 9;
  }

  cursor = ensurePage(doc, cursor, 10);
  setDocColor(doc, colors.muted, "text");
  doc.setFont(baseFont, "bold");
  doc.setFontSize(7.2);
  doc.text("TIME", timeX, cursor);
  doc.text("TYPE", kindX, cursor);
  doc.text("EVENT", eventX, cursor);
  doc.text("NOTE", noteX, cursor);
  doc.text("OPERATOR", operatorX, cursor, { align: "right" });
  cursor += 4;

  rows.forEach((row, index) => {
    doc.setFont(baseFont, "normal");
    doc.setFontSize(8.2);
    const noteLines = row.note ? (doc.splitTextToSize(row.note, noteWidth) as string[]).slice(0, 4) : ["-"];
    const rowHeight = Math.max(10, 5 + noteLines.length * 4.2);
    cursor = ensurePage(doc, cursor, rowHeight + 2);
    setDocColor(doc, index % 2 === 0 ? colors.panel : [255, 255, 255], "fill");
    setDocColor(doc, colors.line, "draw");
    doc.roundedRect(x, cursor, tableWidth, rowHeight, 1.8, 1.8, "FD");
    setDocColor(doc, row.kind === "Issue" ? colors.issue : colors.event, "fill");
    doc.rect(x, cursor, 1.6, rowHeight, "F");

    setDocColor(doc, colors.ink, "text");
    doc.setFont(baseFont, "bold");
    doc.setFontSize(8.1);
    doc.text(row.time, timeX, cursor + 6.3);
    setDocColor(doc, row.kind === "Issue" ? colors.issue : colors.event, "text");
    doc.text(row.kind, kindX, cursor + 6.3, { maxWidth: 15 });
    setDocColor(doc, colors.ink, "text");
    doc.text(row.eventType, eventX, cursor + 6.3, { maxWidth: 32 });
    doc.text(row.operatorName || "-", operatorX, cursor + 6.3, { align: "right", maxWidth: 26 });

    doc.setFont(baseFont, "normal");
    doc.setFontSize(8.3);
    noteLines.forEach((line, lineIndex) => {
      doc.text(line, noteX, cursor + 6.3 + lineIndex * 4.2);
    });

    cursor += rowHeight + 2;
  });

  return cursor + 5;
}

export function exportPdf(production: Production, options: ExportOptions = {}) {
  const sections = buildExportSections(production);
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const baseFont = pdfFont(options.font);

  writeHeader(doc, production, baseFont);
  let y = page.headerHeight + 10;

  writePill(doc, "Session Date", compactDate(production.sessionDate), page.margin, y, 43, baseFont);
  writePill(doc, "Duration", production.studioDuration || "N/A", page.margin + 48, y, 34, baseFont);
  writePill(doc, "Exported Notes", String(exportedNoteCount(sections)), page.margin + 87, y, 34, baseFont);
  writePill(
    doc,
    "Exported",
    formatZonedDateTime(new Date().toISOString(), "America/Los_Angeles"),
    page.margin + 126,
    y,
    62,
    baseFont
  );
  y += 26;

  if (production.recordingPath) {
    y = writeSection(doc, "Recording Path", production.recordingPath, y, baseFont);
  }

  y = writeCrew(doc, production, y, baseFont);
  y = writeNotesTable(doc, "Chronological Log", sections.logRows, y, "No logged events yet.", baseFont);

  if (sections.manualNotes) {
    writeSection(doc, "Manual Notes", sections.manualNotes, y, baseFont);
  }

  const pageCount = doc.getNumberOfPages();
  for (let index = 1; index <= pageCount; index += 1) {
    doc.setPage(index);
    setDocColor(doc, colors.muted, "text");
    doc.setFont(baseFont, "normal");
    doc.setFontSize(7.5);
    doc.text(`Page ${index} of ${pageCount}`, page.width - page.margin, 271, { align: "right" });
  }

  doc.save(`${productionFileStem(production)}-editor-handoff.pdf`);
}
