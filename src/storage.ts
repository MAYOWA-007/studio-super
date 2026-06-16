import type { Crew, Production, ProductionSummary, TargetTimer } from "./types";
import { nowUtcIso } from "./time";

const PRODUCTIONS_KEY = "studio-super:productions";
const ACTIVE_CODE_KEY = "studio-super:active-code";
const OPERATOR_KEY = "studio-super:operator";
const STARTER_CODE = "session";

export const defaultRecordingPath = "";

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimeInputValue(date = new Date()) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function createDefaultTargetTimer(): TargetTimer {
  return {
    targetMinutes: 60,
    scheduledStartTime: localTimeInputValue(),
    scheduledStartMode: "auto",
    status: "idle",
    accumulatedMs: 0,
    pauseCount: 0
  };
}

const emptyCrew: Crew = {
  technicalDirector: "",
  floorManager: "",
  audioOperator: "",
  cameraOneOperator: "",
  cameraThreeOperator: "",
  zoomRecordsNotesOperator: ""
};

export const crewLabels: Record<keyof Crew, string> = {
  technicalDirector: "Technical Director",
  floorManager: "Floor Manager",
  audioOperator: "Audio Operator",
  cameraOneOperator: "Camera 1 Operator",
  cameraThreeOperator: "Camera 3 Operator",
  zoomRecordsNotesOperator: "Zoom / Records / Notes"
};

export function uid(prefix = "id") {
  if (crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function normalizeCode(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function createBlankProduction(codeInput: string, titleInput = ""): Production {
  const now = nowUtcIso();
  const code = normalizeCode(codeInput) || `session-${Date.now().toString(36)}`;

  return {
    id: uid("prod"),
    code,
    title: titleInput.trim() || "",
    shortName: code,
    sessionDate: localDateInputValue(),
    recordingPath: defaultRecordingPath,
    studioDuration: "",
    crew: { ...emptyCrew },
    notesForEditor: "",
    isoRecordDetails: "",
    additionalNotes: "",
    rosterNames: [],
    noteLogs: [],
    targetTimer: createDefaultTargetTimer(),
    createdAtUtc: now,
    updatedAtUtc: now
  };
}

export function createStarterProduction(): Production {
  return {
    ...createBlankProduction(STARTER_CODE),
    title: "",
    shortName: ""
  };
}

export function sanitizeProductions(productions: Production[]) {
  return productions.map((production) => ({
    ...createStarterProduction(),
    ...production,
    crew: {
      ...emptyCrew,
      ...production.crew
    },
    targetTimer: {
      ...createDefaultTargetTimer(),
      ...production.targetTimer
    },
    noteLogs: Array.isArray(production.noteLogs) ? production.noteLogs : [],
    rosterNames: Array.isArray(production.rosterNames) ? production.rosterNames : []
  }));
}

export function summarizeProduction(production: Production): ProductionSummary {
  return {
    code: production.code,
    title: production.title,
    shortName: production.shortName,
    sessionDate: production.sessionDate,
    noteCount: production.noteLogs.filter((note) => !note.deletedAtUtc).length,
    updatedAtUtc: production.updatedAtUtc
  };
}

export function loadProductions(): Production[] {
  const raw = localStorage.getItem(PRODUCTIONS_KEY);
  if (!raw) {
    return [createStarterProduction()];
  }

  try {
    const parsed = JSON.parse(raw) as Production[];
    return Array.isArray(parsed) && parsed.length > 0 ? sanitizeProductions(parsed) : [createStarterProduction()];
  } catch {
    return [createStarterProduction()];
  }
}

export function saveProductions(productions: Production[]) {
  localStorage.setItem(PRODUCTIONS_KEY, JSON.stringify(productions));
}

export function loadActiveCode(fallback: string) {
  return localStorage.getItem(ACTIVE_CODE_KEY) || fallback;
}

export function saveActiveCode(code: string) {
  localStorage.setItem(ACTIVE_CODE_KEY, code);
}

export function loadOperatorName() {
  return localStorage.getItem(OPERATOR_KEY) || "";
}

export function saveOperatorName(name: string) {
  localStorage.setItem(OPERATOR_KEY, name);
}

export function collectRosterNames(production: Production) {
  const noteNames = production.noteLogs.map((note) => note.operatorName).filter(Boolean);
  return Array.from(new Set([...production.rosterNames, ...noteNames]))
    .map((name) => name.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export function collectSavableRosterNames(production: Production) {
  const crewNames = Object.values(production.crew).filter((name) => name.trim().length > 1);
  return Array.from(new Set([...production.rosterNames, ...crewNames]))
    .map((name) => name.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}
