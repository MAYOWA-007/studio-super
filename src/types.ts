export type CrewRole =
  | "technicalDirector"
  | "floorManager"
  | "audioOperator"
  | "cameraOneOperator"
  | "cameraThreeOperator"
  | "zoomRecordsNotesOperator";

export type Crew = Record<CrewRole, string>;

export type NoteAction = "create" | "edit" | "delete" | "restore";

export interface NoteHistoryEntry {
  id: string;
  action: NoteAction;
  operatorName: string;
  utcIso: string;
  previousText?: string;
  nextText?: string;
}

export interface NoteLog {
  id: string;
  eventType: string;
  text: string;
  operatorName: string;
  utcIso: string;
  deletedAtUtc?: string;
  history: NoteHistoryEntry[];
}

export type TargetTimerStatus = "idle" | "running" | "paused" | "complete";

export interface TargetTimer {
  targetMinutes: number;
  scheduledStartTime: string;
  scheduledStartMode?: "auto" | "manual";
  actualStartUtc?: string;
  completedAtUtc?: string;
  status: TargetTimerStatus;
  accumulatedMs: number;
  lastStartedAtUtc?: string;
  pauseStartedAtUtc?: string;
  pauseCount: number;
}

export interface Production {
  id: string;
  code: string;
  title: string;
  shortName: string;
  sessionDate: string;
  recordingPath: string;
  studioDuration: string;
  crew: Crew;
  notesForEditor: string;
  isoRecordDetails: string;
  additionalNotes: string;
  rosterNames: string[];
  noteLogs: NoteLog[];
  targetTimer: TargetTimer;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface ProductionSummary {
  code: string;
  title: string;
  shortName: string;
  sessionDate: string;
  noteCount: number;
  updatedAtUtc: string;
}

export type SortMode = "title" | "date" | "shortName" | "noteCount";
