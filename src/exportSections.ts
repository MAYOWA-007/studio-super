import type { NoteLog, Production } from "./types";

export interface ExportSections {
  logRows: ExportNoteRow[];
  manualNotes: string;
}

export interface ExportNoteRow {
  time: string;
  kind: "Event" | "Issue";
  eventType: string;
  note: string;
  operatorName: string;
}

const hiddenSystemEvents = new Set(["Target Time Reset", "Target Time"]);

function chronologicalNotes(production: Production) {
  return [...production.noteLogs].sort((a, b) => a.utcIso.localeCompare(b.utcIso));
}

function activeNotes(production: Production) {
  return chronologicalNotes(production).filter((note) => !note.deletedAtUtc);
}

function cleanNoteText(note: NoteLog) {
  const text = note.text.trim();
  const event = note.eventType.trim();
  const normalizedText = text.toLowerCase();
  const normalizedEvent = event.toLowerCase();

  if (!text || normalizedText === normalizedEvent || normalizedText === `${normalizedEvent} logged`) {
    return "";
  }

  if (normalizedText.startsWith(`${normalizedEvent}:`)) {
    return text.slice(event.length + 1).trim();
  }

  return text;
}

function shortStudioTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "America/Los_Angeles"
  }).format(new Date(iso));
}

function noteKind(eventType: string): "Event" | "Issue" {
  const normalized = eventType.toLowerCase();
  if (
    normalized.includes("audio") ||
    normalized.includes("zoom") ||
    normalized.includes("video") ||
    normalized.includes("noise") ||
    normalized.includes("editor") ||
    normalized.includes("custom")
  ) {
    return "Issue";
  }

  return "Event";
}

function noteToRow(note: NoteLog): ExportNoteRow {
  return {
    time: shortStudioTime(note.utcIso),
    kind: noteKind(note.eventType),
    eventType: note.eventType,
    note: cleanNoteText(note),
    operatorName: note.operatorName || ""
  };
}

function manualNotes(production: Production) {
  return [production.notesForEditor, production.isoRecordDetails, production.additionalNotes]
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function buildExportSections(production: Production): ExportSections {
  return {
    logRows: activeNotes(production)
      .filter((note) => !hiddenSystemEvents.has(note.eventType))
      .map(noteToRow),
    manualNotes: manualNotes(production)
  };
}
