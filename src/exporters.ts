import { jsPDF } from "jspdf";
import type { CrewRole, Production } from "./types";
import { compactDate, formatZonedDateTime } from "./time";
import { crewLabels } from "./storage";
import { buildExportSections, type ExportNoteRow } from "./exportSections";

export type ExportFont = "modern" | "classic" | "mono" | "editorial" | "wide";

interface ExportOptions {
  font?: ExportFont;
}

const page = {
  width: 215.9,
  height: 279.4,
  margin: 14,
  headerHeight: 36,
  contentBottom: 261,
  footerY: 271.4
};

const colors = {
  ink: [12, 22, 27] as const,
  muted: [83, 103, 110] as const,
  line: [196, 210, 214] as const,
  panel: [248, 247, 244] as const,
  header: [0, 0, 0] as const,
  teal: [228, 0, 43] as const,
  amber: [202, 165, 82] as const,
  red: [228, 0, 43] as const,
  event: [138, 106, 35] as const,
  issue: [228, 0, 43] as const
};

let activePdfFont: ExportFont = "modern";

function pdfFontName() {
  if (activePdfFont === "classic" || activePdfFont === "editorial") {
    return "times";
  }

  if (activePdfFont === "mono") {
    return "courier";
  }

  return "helvetica";
}

function setExportFont(doc: jsPDF, style: "normal" | "bold" = "normal") {
  doc.setFont(pdfFontName(), style);
}

const studioTimeZone = "America/Los_Angeles";

function formatStudioDateTime(iso: string) {
  return formatZonedDateTime(iso, studioTimeZone);
}

function safeFilePart(input: string) {
  return input.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "production";
}

function productionFileStem(production: Production) {
  return safeFilePart(production.shortName || production.code || production.title);
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

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function crewEntries(production: Production) {
  return (Object.keys(crewLabels) as CrewRole[]).map((role) => ({
    label: crewLabels[role],
    value: production.crew[role] || "N/A"
  }));
}

function exportedNoteCount(sections: ReturnType<typeof buildExportSections>) {
  return sections.logRows.length;
}

export function exportCsv(production: Production) {
  const sections = buildExportSections(production);
  const header = ["Time", "Type", "Event", "Note", "Operator"];
  const rows = [
    ...sections.logRows.map((row) => [row.time, row.kind, row.eventType, row.note, row.operatorName])
  ];

  if (sections.manualNotes) {
    rows.push(["", "", "Manual Notes", sections.manualNotes, ""]);
  }

  const metadata = [
    ["Editor Export"],
    ["Program Title", production.title || "Untitled Production"],
    ["Short Name", production.shortName || production.code],
    ["Session Date", compactDate(production.sessionDate)],
    ["Recording Path", production.recordingPath || "N/A"],
    ["Studio Record Duration", production.studioDuration || "N/A"],
    ["Exported Notes", String(exportedNoteCount(sections))],
    ["Exported", formatStudioDateTime(new Date().toISOString())],
    []
  ];

  const csv = [...metadata, header, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
  downloadBlob(`${productionFileStem(production)}-editor-package.csv`, "text/csv;charset=utf-8", csv);
}

function mdSection(title: string, body: string) {
  return `## ${title}\n\n${body.trim() || "_No notes in this section._"}\n`;
}

function mdRows(rows: ExportNoteRow[]) {
  if (rows.length === 0) {
    return "_No logged notes in this section._";
  }

  const escapeCell = (value: string) => value.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
  return [
    "| Time | Type | Event | Note | Operator |",
    "|---|---|---|---|---|",
    ...rows.map((row) =>
      `| ${[row.time, row.kind, row.eventType, row.note || "-", row.operatorName].map(escapeCell).join(" | ")} |`
    )
  ].join("\n");
}

export function buildMarkdown(production: Production) {
  const sections = buildExportSections(production);
  const crewLines = crewEntries(production)
    .map((entry) => `- **${entry.label}:** ${entry.value}`)
    .join("\n");
  const additional = sections.manualNotes
    ? `\n${mdSection("Manual Notes", sections.manualNotes)}`
    : "";

  return `# ${production.title || "Untitled Production"}

**Short Name:** ${production.shortName || production.code}  
**Studio Session Date:** ${compactDate(production.sessionDate)}  
**Pathway to Recordings:** ${production.recordingPath || "N/A"}  
**Studio Record Duration:** ${production.studioDuration || "N/A"}  
**Exported:** ${formatStudioDateTime(new Date().toISOString())}

## Crew

${crewLines}

## Chronological Log

${mdRows(sections.logRows)}
${additional}
`;
}

export function exportMarkdown(production: Production) {
  downloadBlob(
    `${productionFileStem(production)}-editor-package.md`,
    "text/markdown;charset=utf-8",
    buildMarkdown(production)
  );
}

export function exportProductionBackup(production: Production) {
  const payload = {
    schema: "production-backup",
    version: 1,
    exportedAtUtc: new Date().toISOString(),
    production
  };

  downloadBlob(
    `${productionFileStem(production)}-production-backup.json`,
    "application/json;charset=utf-8",
    JSON.stringify(payload, null, 2)
  );
}

export function exportWorkspaceBackup(productions: Production[]) {
  const payload = {
    schema: "workspace-backup",
    version: 1,
    exportedAtUtc: new Date().toISOString(),
    productions
  };

  downloadBlob(
    `workspace-backup.json`,
    "application/json;charset=utf-8",
    JSON.stringify(payload, null, 2)
  );
}

function setDocColor(doc: jsPDF, color: readonly [number, number, number], target: "text" | "fill" | "draw") {
  if (target === "text") doc.setTextColor(color[0], color[1], color[2]);
  if (target === "fill") doc.setFillColor(color[0], color[1], color[2]);
  if (target === "draw") doc.setDrawColor(color[0], color[1], color[2]);
}

function ensurePage(doc: jsPDF, y: number, needed = 22) {
  if (y + needed <= page.contentBottom) {
    return y;
  }

  doc.addPage();
  return page.margin;
}

function wrapParagraph(doc: jsPDF, paragraph: string, maxWidth: number) {
  const text = paragraph.trimEnd();
  if (!text) {
    return [""];
  }

  return doc.splitTextToSize(text, maxWidth) as string[];
}

function sectionLineCount(doc: jsPDF, text: string, maxWidth: number) {
  const paragraphs = (text || "N/A").split(/\r?\n/);
  return paragraphs.reduce((count, paragraph) => {
    const body = paragraph.startsWith("- ") ? paragraph.slice(2) : paragraph;
    return count + wrapParagraph(doc, body, paragraph.startsWith("- ") ? maxWidth - 7 : maxWidth).length;
  }, 0);
}

function wrappedText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight = 4.8) {
  const paragraphs = (text || "N/A").split(/\r?\n/);
  let cursor = y;

  for (const paragraph of paragraphs) {
    const isBullet = paragraph.startsWith("- ");
    const body = isBullet ? paragraph.slice(2) : paragraph;
    const lines = wrapParagraph(doc, body, isBullet ? maxWidth - 7 : maxWidth);

    for (let index = 0; index < lines.length; index += 1) {
      cursor = ensurePage(doc, cursor, lineHeight + 2);
      if (isBullet && index === 0) {
        doc.text("-", x, cursor);
      }
      doc.text(lines[index] || " ", x + (isBullet ? 5 : 0), cursor);
      cursor += lineHeight;
    }

    if (!paragraph.trim()) {
      cursor += lineHeight / 2;
    }
  }

  return cursor;
}

function writeHeader(doc: jsPDF, production: Production) {
  setDocColor(doc, colors.header, "fill");
  doc.rect(0, 0, page.width, page.headerHeight, "F");
  setDocColor(doc, colors.teal, "fill");
  doc.rect(0, page.headerHeight - 2, page.width, 2, "F");

  setDocColor(doc, [255, 255, 255], "text");
  setExportFont(doc, "bold");
  doc.setFontSize(14);
  const titleLines = doc.splitTextToSize(production.title || "Untitled Production", 150) as string[];
  const visibleTitleLines = titleLines.slice(0, 2);
  if (titleLines.length > 2) {
    visibleTitleLines[1] = `${visibleTitleLines[1].replace(/\s+\S*$/, "")}...`;
  }
  visibleTitleLines.forEach((line, index) => {
    doc.text(line, page.margin, 12 + index * 6);
  });
  doc.setFontSize(9);
  setExportFont(doc);
  doc.text("Editor Handoff", page.margin, 30);

  setExportFont(doc, "bold");
  doc.text(production.shortName || production.code || "production", page.width - page.margin, 24, {
    align: "right"
  });
  setExportFont(doc);
  doc.text(compactDate(production.sessionDate), page.width - page.margin, 30, { align: "right" });
}

function writePill(doc: jsPDF, label: string, value: string, x: number, y: number, width: number) {
  setDocColor(doc, colors.panel, "fill");
  setDocColor(doc, colors.line, "draw");
  doc.roundedRect(x, y, width, 16, 2.5, 2.5, "FD");
  setDocColor(doc, colors.muted, "text");
  setExportFont(doc, "bold");
  doc.setFontSize(7);
  doc.text(label.toUpperCase(), x + 4, y + 5.3);
  setDocColor(doc, colors.ink, "text");
  doc.setFontSize(8.6);
  doc.text(value || "N/A", x + 4, y + 11.6, { maxWidth: width - 8 });
}

function writeSection(doc: jsPDF, title: string, body: string, y: number) {
  const content = body.trim() || "No notes in this section.";
  const firstLinesToKeep = Math.min(3, sectionLineCount(doc, content, 186));
  let cursor = ensurePage(doc, y, 12 + firstLinesToKeep * 4.8);
  cursor = writeSectionTitle(doc, title, cursor);
  setExportFont(doc);
  doc.setFontSize(9.2);
  setDocColor(doc, colors.ink, "text");
  cursor = wrappedText(doc, content, page.margin, cursor, 186, 4.8);
  return cursor + 5;
}

function writeSectionTitle(doc: jsPDF, title: string, y: number) {
  let cursor = ensurePage(doc, y, 14);
  setDocColor(doc, colors.teal, "fill");
  doc.rect(page.margin, cursor - 1.4, 2.5, 6.4, "F");
  setDocColor(doc, colors.ink, "text");
  setExportFont(doc, "bold");
  doc.setFontSize(11.5);
  doc.text(title, page.margin + 6, cursor + 4);
  return cursor + 8.5;
}

function writeCrew(doc: jsPDF, production: Production, y: number) {
  let cursor = writeSectionTitle(doc, "Crew", y);
  const entries = crewEntries(production);
  const colWidth = 59.5;
  entries.forEach((entry, index) => {
    const x = page.margin + (index % 3) * (colWidth + 4.5);
    if (index % 3 === 0) {
      cursor = ensurePage(doc, cursor, 16);
    }
    writePill(doc, entry.label, entry.value, x, cursor, colWidth);
    if (index % 3 === 2) {
      cursor += 18.5;
    }
  });
  return cursor + 2;
}

function ellipsizeLine(line: string) {
  return line.length > 118 ? `${line.slice(0, 115).trimEnd()}...` : line;
}

function writeNotesTable(doc: jsPDF, title: string, rows: ExportNoteRow[], y: number, emptyText: string) {
  let cursor = writeSectionTitle(doc, title, y);
  const x = page.margin;
  const tableWidth = page.width - page.margin * 2;
  const timeX = x + 4;
  const kindX = x + 25;
  const eventX = x + 43;
  const noteX = x + 78;
  const operatorX = x + tableWidth - 4;
  const noteWidth = 80;

  if (rows.length === 0) {
    setExportFont(doc);
    doc.setFontSize(8.6);
    setDocColor(doc, colors.muted, "text");
    doc.text(emptyText, x, cursor);
    return cursor + 7;
  }

  cursor = ensurePage(doc, cursor, 10);
  setDocColor(doc, colors.muted, "text");
  setExportFont(doc, "bold");
  doc.setFontSize(7.2);
  doc.text("TIME", timeX, cursor);
  doc.text("TYPE", kindX, cursor);
  doc.text("EVENT", eventX, cursor);
  doc.text("NOTE", noteX, cursor);
  doc.text("OPERATOR", operatorX, cursor, { align: "right" });
  cursor += 3;

  rows.forEach((row, index) => {
    setExportFont(doc);
    doc.setFontSize(8.2);
    const noteLines = row.note
      ? (doc.splitTextToSize(row.note, noteWidth) as string[]).map(ellipsizeLine)
      : [];
    const lineCount = Math.max(1, noteLines.length);
    const rowHeight = Math.max(11, 6.2 + lineCount * 4.2);
    cursor = ensurePage(doc, cursor, rowHeight + 2);

    setDocColor(doc, index % 2 === 0 ? colors.panel : [255, 255, 255], "fill");
    setDocColor(doc, colors.line, "draw");
    doc.roundedRect(x, cursor, tableWidth, rowHeight, 1.8, 1.8, "FD");
    setDocColor(doc, row.kind === "Issue" ? colors.issue : colors.event, "fill");
    doc.rect(x, cursor, 1.6, rowHeight, "F");

    setDocColor(doc, colors.ink, "text");
    setExportFont(doc, "bold");
    doc.setFontSize(8.1);
    doc.text(row.time, timeX, cursor + 6.3);
    setDocColor(doc, row.kind === "Issue" ? colors.issue : colors.event, "text");
    doc.text(row.kind, kindX, cursor + 6.3, { maxWidth: 15 });
    setDocColor(doc, colors.ink, "text");
    doc.text(row.eventType, eventX, cursor + 6.3, { maxWidth: 32 });
    doc.text(row.operatorName || "-", operatorX, cursor + 6.3, { align: "right", maxWidth: 26 });

    setExportFont(doc);
    doc.setFontSize(8.3);
    setDocColor(doc, row.note ? colors.ink : colors.muted, "text");
    if (noteLines.length > 0) {
      noteLines.forEach((line, lineIndex) => {
        doc.text(line, noteX, cursor + 6.3 + lineIndex * 4.2);
      });
    } else {
      doc.text("-", noteX, cursor + 6.3);
    }

    cursor += rowHeight + 2;
  });

  return cursor + 2;
}

export async function exportPdf(production: Production, options: ExportOptions = {}) {
  activePdfFont = options.font || "modern";
  const sections = buildExportSections(production);
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  writeHeader(doc, production);

  let y = page.headerHeight + 8;
  writePill(doc, "Session Date", compactDate(production.sessionDate), page.margin, y, 43);
  writePill(doc, "Duration", production.studioDuration || "N/A", page.margin + 48, y, 34);
  writePill(doc, "Exported Notes", String(exportedNoteCount(sections)), page.margin + 87, y, 34);
  writePill(doc, "Exported", formatStudioDateTime(new Date().toISOString()), page.margin + 126, y, 62);
  y += 21;

  if (production.recordingPath.trim()) {
    y = writeSection(doc, "Recording Path", production.recordingPath, y);
  }
  y = writeCrew(doc, production, y);
  y = writeNotesTable(doc, "Chronological Log", sections.logRows, y, "No logged editor events yet.");

  if (sections.manualNotes) {
    writeSection(doc, "Manual Notes", sections.manualNotes, y);
  }

  const pageCount = doc.getNumberOfPages();
  for (let index = 1; index <= pageCount; index += 1) {
    doc.setPage(index);
    setDocColor(doc, colors.muted, "text");
    setExportFont(doc);
    doc.setFontSize(7.5);
    doc.text(
      `${production.shortName || production.code || "production"} | Page ${index} of ${pageCount}`,
      page.margin,
      page.footerY
    );
  }

  doc.save(`${productionFileStem(production)}-editor-package.pdf`);
}
