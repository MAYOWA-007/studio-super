import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  FileArchive,
  FileText,
  Flag,
  Mic2,
  Monitor,
  PauseCircle,
  PlayCircle,
  Plus,
  Radio,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Square,
  Trash2,
  Type,
  Video
} from "lucide-react";
import type { CrewRole, NoteLog, Production, TargetTimer } from "./types";
import {
  collectRosterNames,
  createBlankProduction,
  createStarterProduction,
  crewLabels,
  loadActiveCode,
  loadOperatorName,
  loadProductions,
  saveActiveCode,
  saveOperatorName,
  saveProductions,
  uid
} from "./storage";
import { compactDate, formatZonedDateTime, nowUtcIso } from "./time";
import {
  exportCsv,
  exportMarkdown,
  exportPdf,
  exportProductionBackup,
  exportWorkspaceBackup,
  type ExportFont
} from "./exporters";

type DashboardTab = "log" | "details" | "export";
type QuickActionTone = "event" | "issue" | "timer";

interface QuickAction {
  label: string;
  helper: string;
  tone: QuickActionTone;
  icon: typeof Flag;
}

const fontOptions: { id: ExportFont; label: string; detail: string }[] = [
  { id: "modern", label: "Modern", detail: "Clean sans" },
  { id: "classic", label: "Classic", detail: "Editorial serif" },
  { id: "mono", label: "Mono", detail: "Technical notes" }
];

const quickActions: QuickAction[] = [
  { label: "Session Start", helper: "Opening marker", tone: "event", icon: Flag },
  { label: "Good Take", helper: "Strong usable moment", tone: "event", icon: CheckCircle2 },
  { label: "Camera Note", helper: "Shot or framing note", tone: "event", icon: Video },
  { label: "Audio Issue", helper: "Mic, mix, noise", tone: "issue", icon: Mic2 },
  { label: "Video Issue", helper: "Signal or picture", tone: "issue", icon: Monitor },
  { label: "Editor Flag", helper: "Needs review", tone: "issue", icon: AlertTriangle }
];

const fontStorageKey = "studio-super:font";
const pacificTimeZone = "America/Los_Angeles";
const timeZoneKey = "studio-super:selected-time-zone";
const targetMinuteOptions = [30, 45, 60, 75, 90, 120, 150, 180];

const timeZoneOptions = [
  { label: "West Coast", value: "America/Los_Angeles" },
  { label: "East Coast", value: "America/New_York" }
] as const;

type TimeZoneValue = (typeof timeZoneOptions)[number]["value"];

function initialProductions() {
  const loaded = loadProductions();
  return loaded.length > 0 ? loaded : [createStarterProduction()];
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function padTimePart(value: number) {
  return String(value).padStart(2, "0");
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${padTimePart(minutes)}:${padTimePart(seconds)}`;
  }

  return `${padTimePart(minutes)}:${padTimePart(seconds)}`;
}

function formatRemaining(ms: number) {
  if (ms < 0) {
    return `+${formatDuration(Math.abs(ms))}`;
  }

  return formatDuration(ms);
}

function formatDurationLong(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
    timeZone
  }).formatToParts(date);

  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(partMap.year),
    month: Number(partMap.month),
    day: Number(partMap.day),
    hour: Number(partMap.hour),
    minute: Number(partMap.minute),
    second: Number(partMap.second)
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  const localAsUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return localAsUtcMs - date.getTime();
}

function timeInputToZonedDate(value: string, baseIso: string, timeZone = pacificTimeZone) {
  if (!value) {
    return null;
  }

  const [hours = 0, minutes = 0, seconds = 0] = value.split(":").map(Number);
  const baseParts = zonedParts(new Date(baseIso), timeZone);
  const localAsUtcMs = Date.UTC(baseParts.year, baseParts.month - 1, baseParts.day, hours, minutes, seconds);
  const firstPass = new Date(localAsUtcMs - timeZoneOffsetMs(new Date(localAsUtcMs), timeZone));
  return new Date(localAsUtcMs - timeZoneOffsetMs(firstPass, timeZone));
}

function dateToTimeInput(date = new Date(), timeZone = pacificTimeZone) {
  const parts = zonedParts(date, timeZone);
  return `${padTimePart(parts.hour)}:${padTimePart(parts.minute)}`;
}

function formatClock(date: Date | null, timeZone = pacificTimeZone) {
  if (!date) {
    return "--:--:--";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone
  });
}

function buildTargetSnapshot(timer: TargetTimer, nowIso: string, timeZone = pacificTimeZone) {
  const nowMs = new Date(nowIso).getTime();
  const targetMs = timer.targetMinutes * 60 * 1000;
  const isAutoScheduledStart = timer.scheduledStartMode !== "manual";
  const runningMs =
    timer.status === "running" && timer.lastStartedAtUtc
      ? Math.max(0, nowMs - new Date(timer.lastStartedAtUtc).getTime())
      : 0;
  const activeMs = timer.accumulatedMs + runningMs;
  const pausedMs =
    timer.status === "paused" && timer.pauseStartedAtUtc
      ? Math.max(0, nowMs - new Date(timer.pauseStartedAtUtc).getTime())
      : 0;
  const remainingMs = targetMs - activeMs;
  const scheduledStart =
    isAutoScheduledStart && !timer.actualStartUtc
      ? new Date(nowMs)
      : timeInputToZonedDate(timer.scheduledStartTime, timer.actualStartUtc || nowIso, timeZone);
  const plannedEnd = scheduledStart ? new Date(scheduledStart.getTime() + targetMs) : null;
  const actualStart = timer.actualStartUtc ? new Date(timer.actualStartUtc) : null;
  const completedAt = timer.completedAtUtc ? new Date(timer.completedAtUtc) : null;
  const projectedEnd =
    timer.status === "idle" && plannedEnd
      ? plannedEnd
      : timer.status === "complete"
        ? completedAt || plannedEnd || new Date(nowMs)
        : new Date(nowMs + remainingMs);
  const slipMs = plannedEnd ? projectedEnd.getTime() - plannedEnd.getTime() : 0;

  return {
    targetMs,
    activeMs,
    pausedMs,
    remainingMs,
    scheduledStart,
    plannedEnd,
    actualStart,
    completedAt,
    projectedEnd,
    slipMs,
    isComplete: activeMs >= targetMs
  };
}

function loadSelectedTimeZone(): TimeZoneValue {
  const saved = localStorage.getItem(timeZoneKey);
  return timeZoneOptions.some((option) => option.value === saved)
    ? (saved as TimeZoneValue)
    : "America/Los_Angeles";
}

function activeNoteCount(production: Production) {
  return production.noteLogs.filter((note) => !note.deletedAtUtc).length;
}

function eventKind(eventType: string): QuickActionTone {
  const normalized = eventType.toLowerCase();
  if (normalized.includes("issue") || normalized.includes("flag") || normalized.includes("problem")) {
    return "issue";
  }
  if (normalized.includes("timer") || normalized.includes("target time")) {
    return "timer";
  }
  return "event";
}

function sortByUpdated(productions: Production[]) {
  return [...productions].sort((a, b) => b.updatedAtUtc.localeCompare(a.updatedAtUtc));
}

function App() {
  const [productions, setProductions] = useState<Production[]>(initialProductions);
  const [activeCode, setActiveCode] = useState(() => loadActiveCode(productions[0]?.code || "session"));
  const [activeTab, setActiveTab] = useState<DashboardTab>("log");
  const [operatorName, setOperatorName] = useState(loadOperatorName);
  const [noteText, setNoteText] = useState("");
  const [customEvent, setCustomEvent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [nowMs, setNowMs] = useState(Date.now());
  const [selectedTimeZone, setSelectedTimeZone] = useState<TimeZoneValue>(loadSelectedTimeZone);
  const [fontChoice, setFontChoice] = useState<ExportFont>(() => {
    const stored = localStorage.getItem(fontStorageKey);
    return stored === "classic" || stored === "mono" || stored === "modern" ? stored : "modern";
  });

  const activeProduction = useMemo(() => {
    return productions.find((production) => production.code === activeCode) || productions[0] || createStarterProduction();
  }, [activeCode, productions]);

  const productionList = useMemo(() => sortByUpdated(productions), [productions]);
  const rosterNames = useMemo(() => collectRosterNames(activeProduction), [activeProduction]);
  const visibleNotes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return [...activeProduction.noteLogs]
      .sort((a, b) => b.utcIso.localeCompare(a.utcIso))
      .filter((note) => {
        if (!query) return true;
        return [note.eventType, note.text, note.operatorName]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
  }, [activeProduction.noteLogs, searchQuery]);

  const nowIso = new Date(nowMs).toISOString();
  const targetTimer = activeProduction.targetTimer;
  const targetSnapshot = useMemo(
    () => buildTargetSnapshot(targetTimer, nowIso, selectedTimeZone),
    [nowIso, selectedTimeZone, targetTimer]
  );
  const targetOptions = targetMinuteOptions.includes(targetTimer.targetMinutes)
    ? targetMinuteOptions
    : [...targetMinuteOptions, targetTimer.targetMinutes].sort((a, b) => a - b);
  const targetProgress =
    targetSnapshot.targetMs > 0 ? Math.min(100, (targetSnapshot.activeMs / targetSnapshot.targetMs) * 100) : 0;
  const visibleTime = formatClock(new Date(nowMs), selectedTimeZone);
  const targetStatus =
    targetTimer.status === "running" && targetSnapshot.remainingMs < 0
      ? "Over target time"
      : targetTimer.status === "complete"
        ? "Target time reached"
        : targetTimer.status === "running"
          ? "Target time running"
          : targetTimer.status === "paused"
            ? "Target time paused"
            : "Ready to start";

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    saveProductions(productions);
  }, [productions]);

  useEffect(() => {
    saveActiveCode(activeProduction.code);
  }, [activeProduction.code]);

  useEffect(() => {
    saveOperatorName(operatorName);
  }, [operatorName]);

  useEffect(() => {
    document.documentElement.dataset.font = fontChoice;
    localStorage.setItem(fontStorageKey, fontChoice);
  }, [fontChoice]);

  useEffect(() => {
    localStorage.setItem(timeZoneKey, selectedTimeZone);
  }, [selectedTimeZone]);

  function patchProduction(id: string, patch: Partial<Production>) {
    setProductions((current) =>
      current.map((production) =>
        production.id === id
          ? {
              ...production,
              ...patch,
              updatedAtUtc: nowUtcIso()
            }
          : production
      )
    );
  }

  function patchActiveProduction(patch: Partial<Production>) {
    patchProduction(activeProduction.id, patch);
  }

  function patchCrew(role: CrewRole, value: string) {
    patchActiveProduction({
      crew: {
        ...activeProduction.crew,
        [role]: value
      }
    });
  }

  function patchTimer(nextTimer: TargetTimer) {
    patchActiveProduction({ targetTimer: nextTimer });
  }

  function addSystemNote(eventType: string, text: string) {
    const note = createNote(eventType, text);
    patchActiveProduction({
      noteLogs: [...activeProduction.noteLogs, note]
    });
  }

  function timerNote(eventType: string, text: string, utcIso: string): NoteLog {
    const noteOperator = operatorName.trim() || "Target Clock";
    return {
      id: uid("note"),
      eventType,
      text,
      operatorName: noteOperator,
      utcIso,
      history: [
        {
          id: uid("hist"),
          action: "create",
          operatorName: noteOperator,
          utcIso,
          nextText: text
        }
      ]
    };
  }

  function createNote(eventType: string, text: string): NoteLog {
    const now = nowUtcIso();
    return {
      id: uid("note"),
      eventType,
      text,
      operatorName: operatorName.trim(),
      utcIso: now,
      history: [
        {
          id: uid("hist"),
          action: "create",
          operatorName: operatorName.trim(),
          utcIso: now,
          nextText: text
        }
      ]
    };
  }

  function addNote(eventType: string, text = noteText) {
    const cleanEvent = eventType.trim() || customEvent.trim() || "General Note";
    const cleanText = text.trim() || `${cleanEvent} logged`;
    const note = createNote(cleanEvent, cleanText);
    const nextRoster = operatorName.trim()
      ? Array.from(new Set([...activeProduction.rosterNames, operatorName.trim()]))
      : activeProduction.rosterNames;

    patchActiveProduction({
      noteLogs: [...activeProduction.noteLogs, note],
      rosterNames: nextRoster
    });
    setNoteText("");
  }

  function deleteNote(noteId: string) {
    const now = nowUtcIso();
    patchActiveProduction({
      noteLogs: activeProduction.noteLogs.map((note) =>
        note.id === noteId
          ? {
              ...note,
              deletedAtUtc: now,
              history: [
                ...note.history,
                {
                  id: uid("hist"),
                  action: "delete",
                  operatorName: operatorName.trim(),
                  utcIso: now,
                  previousText: note.text
                }
              ]
            }
          : note
      )
    });
  }

  function restoreNote(noteId: string) {
    const now = nowUtcIso();
    patchActiveProduction({
      noteLogs: activeProduction.noteLogs.map((note) => {
        if (note.id !== noteId) return note;
        const restored = { ...note };
        delete restored.deletedAtUtc;
        return {
          ...restored,
          history: [
            ...note.history,
            {
              id: uid("hist"),
              action: "restore",
              operatorName: operatorName.trim(),
              utcIso: now,
              nextText: note.text
            }
          ]
        };
      })
    });
  }

  function createProduction() {
    const next = createBlankProduction(`session-${Date.now().toString(36)}`, "Untitled Session");
    setProductions((current) => [next, ...current]);
    setActiveCode(next.code);
    setActiveTab("details");
  }

  function deleteProduction() {
    if (productions.length <= 1) {
      const starter = createStarterProduction();
      setProductions([starter]);
      setActiveCode(starter.code);
      setActiveTab("details");
      return;
    }

    if (!window.confirm(`Delete "${activeProduction.title || activeProduction.code}" from this browser?`)) {
      return;
    }

    const remaining = productions.filter((production) => production.id !== activeProduction.id);
    setProductions(remaining);
    setActiveCode(remaining[0].code);
  }

  function updateTimerWithNote(
    updater: (timer: TargetTimer, utcIso: string) => { timer: TargetTimer; text: string; eventType: string }
  ) {
    const utcIso = nowUtcIso();
    setProductions((current) =>
      current.map((production) => {
        if (production.id !== activeProduction.id) {
          return production;
        }

        const result = updater(production.targetTimer, utcIso);
        const note = timerNote(result.eventType, result.text, utcIso);
        const noteLogs = [...production.noteLogs, note];
        return {
          ...production,
          targetTimer: result.timer,
          noteLogs,
          rosterNames: collectRosterNames({ ...production, noteLogs }),
          updatedAtUtc: utcIso
        };
      })
    );
  }

  function updateTimerTarget(minutes: number) {
    patchTimer({
      ...activeProduction.targetTimer,
      targetMinutes: minutes
    });
  }

  function addTargetMinutes(minutes: number) {
    patchTimer({
      ...activeProduction.targetTimer,
      targetMinutes: Math.max(1, activeProduction.targetTimer.targetMinutes + minutes)
    });
  }

  function updateTimerStart(value: string) {
    patchTimer({
      ...activeProduction.targetTimer,
      scheduledStartTime: value,
      scheduledStartMode: "manual"
    });
  }

  function startOrResumeTargetTime() {
    updateTimerWithNote((timer, utcIso) => {
      if (timer.status === "running") {
        return {
          timer,
          eventType: "Target Time",
          text: "Target time already running"
        };
      }

      if (timer.status === "paused" && timer.pauseStartedAtUtc) {
        const pauseMs = Math.max(0, new Date(utcIso).getTime() - new Date(timer.pauseStartedAtUtc).getTime());
        const pauseCount = timer.pauseCount + 1;
        return {
          timer: {
            ...timer,
            status: "running",
            lastStartedAtUtc: utcIso,
            pauseStartedAtUtc: undefined,
            pauseCount
          },
          eventType: "Target Time Resume",
          text: `Target time resumed after pause #${pauseCount} (${formatDurationLong(pauseMs)})`
        };
      }

      const isManualSchedule = timer.scheduledStartMode === "manual";
      const scheduledStartTime =
        isManualSchedule && timer.scheduledStartTime
          ? timer.scheduledStartTime
          : dateToTimeInput(new Date(utcIso), selectedTimeZone);
      return {
        timer: {
          ...timer,
          scheduledStartTime,
          scheduledStartMode: isManualSchedule ? "manual" : "auto",
          actualStartUtc: utcIso,
          completedAtUtc: undefined,
          status: "running",
          accumulatedMs: 0,
          lastStartedAtUtc: utcIso,
          pauseStartedAtUtc: undefined,
          pauseCount: 0
        },
        eventType: "Target Time Start",
        text: `Target time started: ${timer.targetMinutes} minute target`
      };
    });
  }

  function pauseTargetTime() {
    updateTimerWithNote((timer, utcIso) => {
      const snapshot = buildTargetSnapshot(timer, utcIso, selectedTimeZone);
      return {
        timer: {
          ...timer,
          status: "paused",
          accumulatedMs: snapshot.activeMs,
          lastStartedAtUtc: undefined,
          pauseStartedAtUtc: utcIso,
          completedAtUtc: undefined
        },
        eventType: "Target Time Pause",
        text: `Target time paused at ${formatDuration(snapshot.activeMs)} active, ${formatRemaining(snapshot.remainingMs)} remaining`
      };
    });
  }

  function completeTargetTime() {
    updateTimerWithNote((timer, utcIso) => {
      const snapshot = buildTargetSnapshot(timer, utcIso, selectedTimeZone);
      return {
        timer: {
          ...timer,
          status: "complete",
          accumulatedMs: snapshot.activeMs,
          lastStartedAtUtc: undefined,
          pauseStartedAtUtc: undefined,
          completedAtUtc: utcIso
        },
        eventType: "Target Time Complete",
        text: `Target time completed at ${formatDuration(snapshot.activeMs)} active`
      };
    });
  }

  function resetTargetTime() {
    if (!window.confirm("Reset the target clock for this session?")) {
      return;
    }

    updateTimerWithNote((timer, utcIso) => ({
      timer: {
        targetMinutes: timer.targetMinutes,
        scheduledStartTime: dateToTimeInput(new Date(utcIso), selectedTimeZone),
        scheduledStartMode: "auto",
        status: "idle",
        accumulatedMs: 0,
        pauseCount: 0
      },
      eventType: "Target Time Reset",
      text: "Target time reset"
    }));
  }

  function recordStart() {
    addNote("Record Start", "Record started");
  }

  function recordStop() {
    const utcIso = nowUtcIso();
    setProductions((current) =>
      current.map((production) => {
        if (production.id !== activeProduction.id) {
          return production;
        }

        const recordStartNote = [...production.noteLogs]
          .filter((note) => note.eventType === "Record Start" && !note.deletedAtUtc)
          .sort((a, b) => b.utcIso.localeCompare(a.utcIso))[0];
        const durationText = recordStartNote
          ? formatDurationLong(Math.max(0, new Date(utcIso).getTime() - new Date(recordStartNote.utcIso).getTime()))
          : production.studioDuration;
        const text = recordStartNote ? `Record stopped after ${durationText}` : "Record Stop logged without a Record Start";
        const note = timerNote("Record Stop", text, utcIso);
        const noteLogs = [...production.noteLogs, note];

        return {
          ...production,
          studioDuration: recordStartNote ? durationText : production.studioDuration,
          noteLogs,
          rosterNames: collectRosterNames({ ...production, noteLogs }),
          updatedAtUtc: utcIso
        };
      })
    );
  }

  const exportOptions = { font: fontChoice };

  return (
    <div className="studio-shell">
      <header className="topbar">
        <div className="title-stack">
          <span className="eyebrow">Open source session notebook</span>
          <h1>Studio Super</h1>
        </div>
        <div className="topbar-controls">
          <label className="operator-field">
            <span>Operator</span>
            <input
              value={operatorName}
              list="roster-names"
              onChange={(event) => setOperatorName(event.target.value)}
              placeholder="Name"
            />
          </label>
          <datalist id="roster-names">
            {rosterNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <div className="font-switcher" aria-label="Font options">
            <Type size={18} aria-hidden="true" />
            {fontOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={fontChoice === option.id ? "active" : ""}
                onClick={() => setFontChoice(option.id)}
                title={option.detail}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="workspace">
        <aside className="session-rail" aria-label="Sessions">
          <div className="rail-header">
            <div>
              <p className="section-kicker">Sessions</p>
              <strong>{productions.length}</strong>
            </div>
            <button className="icon-button" type="button" onClick={createProduction} title="New session">
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="session-list">
            {productionList.map((production) => (
              <button
                className={production.code === activeProduction.code ? "session-item active" : "session-item"}
                key={production.id}
                type="button"
                onClick={() => setActiveCode(production.code)}
              >
                <span>{production.title || "Untitled Session"}</span>
                <small>
                  {compactDate(production.sessionDate)} · {activeNoteCount(production)} notes
                </small>
              </button>
            ))}
          </div>
        </aside>

        <section className="main-stage" aria-label="Studio workspace">
          <nav className="tabbar" aria-label="Workspace sections">
            <button className={activeTab === "log" ? "active" : ""} type="button" onClick={() => setActiveTab("log")}>
              <ClipboardList size={18} aria-hidden="true" />
              Log
            </button>
            <button
              className={activeTab === "details" ? "active" : ""}
              type="button"
              onClick={() => setActiveTab("details")}
            >
              <Settings2 size={18} aria-hidden="true" />
              Details
            </button>
            <button
              className={activeTab === "export" ? "active" : ""}
              type="button"
              onClick={() => setActiveTab("export")}
            >
              <Download size={18} aria-hidden="true" />
              Export
            </button>
          </nav>

          {activeTab === "log" && (
            <section className="tab-panel log-grid">
              <div className="timer-panel">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">Current time</p>
                    <h2>{visibleTime}</h2>
                  </div>
                  <span className={`status-pill timer-state ${targetTimer.status}`}>{targetStatus}</span>
                </div>
                <div className="timer-track" aria-label="Timer progress">
                  <span style={{ width: `${targetProgress}%` }} />
                </div>
                <div className="clock-strip">
                  <div>
                    <span>Projected end</span>
                    <strong>{formatClock(targetSnapshot.projectedEnd, selectedTimeZone)}</strong>
                  </div>
                  <label>
                    Time zone
                    <select
                      value={selectedTimeZone}
                      onChange={(event) => setSelectedTimeZone(event.target.value as TimeZoneValue)}
                    >
                      {timeZoneOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="timer-meta">
                  <label>
                    Target time
                    <select value={targetTimer.targetMinutes} onChange={(event) => updateTimerTarget(Number(event.target.value))}>
                      {targetOptions.map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {minutes} min
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Scheduled start
                    <input
                      type="time"
                      value={targetTimer.scheduledStartTime}
                      onChange={(event) => updateTimerStart(event.target.value)}
                    />
                  </label>
                </div>
                <div className="timer-actions">
                  <button className="timer-step" type="button" onClick={recordStart}>
                    <span className="timer-step-number">1</span>
                    <Radio size={17} aria-hidden="true" />
                    Record Start
                  </button>
                  <button
                    className={`timer-step target-step ${targetTimer.status === "running" ? "pause" : "start"}`}
                    type="button"
                    onClick={targetTimer.status === "running" ? pauseTargetTime : startOrResumeTargetTime}
                  >
                    <span className="timer-step-number">2</span>
                    {targetTimer.status === "running" ? (
                      <PauseCircle size={17} aria-hidden="true" />
                    ) : (
                      <PlayCircle size={17} aria-hidden="true" />
                    )}
                    {targetTimer.status === "running"
                      ? "Target Pause"
                      : targetTimer.status === "paused"
                        ? "Target Resume"
                        : "Target Start"}
                  </button>
                  <button className="timer-step" type="button" onClick={recordStop}>
                    <span className="timer-step-number">3</span>
                    <Square size={17} aria-hidden="true" />
                    Record Stop
                  </button>
                  <button type="button" onClick={completeTargetTime}>
                    <CheckCircle2 size={17} aria-hidden="true" />
                    Complete
                  </button>
                  <button type="button" onClick={resetTargetTime}>
                    <RotateCcw size={17} aria-hidden="true" />
                    Reset
                  </button>
                </div>
                <div className="time-adders" aria-label="Add target time">
                  <button type="button" onClick={() => addTargetMinutes(1)}>
                    +1 min
                  </button>
                </div>
                <div className="target-stat-grid">
                  <div>
                    <span>Remaining</span>
                    <strong>{formatRemaining(targetSnapshot.remainingMs)}</strong>
                  </div>
                  <div>
                    <span>Active</span>
                    <strong>{formatDuration(targetSnapshot.activeMs)}</strong>
                  </div>
                  <div>
                    <span>Target ends</span>
                    <strong>{formatClock(targetSnapshot.plannedEnd, selectedTimeZone)}</strong>
                  </div>
                </div>
              </div>

              <div className="note-composer">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">Live log</p>
                    <h2>{activeProduction.title || "Untitled Session"}</h2>
                  </div>
                  <span className="status-pill">{activeNoteCount(activeProduction)} active</span>
                </div>
                <div className="quick-grid">
                  {quickActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        className={`quick-action ${action.tone}`}
                        key={action.label}
                        type="button"
                        onClick={() => addNote(action.label)}
                      >
                        <Icon size={18} aria-hidden="true" />
                        <span>{action.label}</span>
                        <small>{action.helper}</small>
                      </button>
                    );
                  })}
                </div>
                <div className="composer-row">
                  <label>
                    Event type
                    <input
                      value={customEvent}
                      onChange={(event) => setCustomEvent(event.target.value)}
                      placeholder="General Note"
                    />
                  </label>
                  <label className="wide-field">
                    Note
                    <textarea
                      value={noteText}
                      onChange={(event) => setNoteText(event.target.value)}
                      placeholder="What should the editor or producer know?"
                    />
                  </label>
                  <button className="primary-action" type="button" onClick={() => addNote(customEvent || "General Note")}>
                    <Save size={18} aria-hidden="true" />
                    Save note
                  </button>
                </div>
              </div>

              <div className="notes-panel">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">Chronological notes</p>
                    <h2>Latest first</h2>
                  </div>
                  <label className="search-field">
                    <Search size={16} aria-hidden="true" />
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search"
                    />
                  </label>
                </div>
                <div className="note-list">
                  {visibleNotes.length === 0 ? (
                    <p className="empty-state">No notes match this view.</p>
                  ) : (
                    visibleNotes.map((note) => (
                      <article
                        className={`note-row ${eventKind(note.eventType)} ${note.deletedAtUtc ? "deleted" : ""}`}
                        key={note.id}
                      >
                        <div>
                          <span className="note-type">{note.eventType}</span>
                          <time>{formatZonedDateTime(note.utcIso, "America/Los_Angeles")}</time>
                        </div>
                        <p>{note.text}</p>
                        <footer>
                          <span>{note.operatorName || "No operator"}</span>
                          {note.deletedAtUtc ? (
                            <button type="button" onClick={() => restoreNote(note.id)}>
                              Restore
                            </button>
                          ) : (
                            <button type="button" onClick={() => deleteNote(note.id)} title="Delete note">
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          )}
                        </footer>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </section>
          )}

          {activeTab === "details" && (
            <section className="tab-panel detail-grid">
              <div className="details-panel">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">Project details</p>
                    <h2>Session identity</h2>
                  </div>
                  <button className="danger-action" type="button" onClick={deleteProduction}>
                    <Trash2 size={17} aria-hidden="true" />
                    Delete
                  </button>
                </div>
                <div className="field-grid">
                  <label>
                    Title
                    <input
                      value={activeProduction.title}
                      onChange={(event) => patchActiveProduction({ title: event.target.value })}
                      placeholder="Untitled Session"
                    />
                  </label>
                  <label>
                    Short name
                    <input
                      value={activeProduction.shortName}
                      onChange={(event) => patchActiveProduction({ shortName: event.target.value })}
                      placeholder="Short label"
                    />
                  </label>
                  <label>
                    Session date
                    <input
                      type="date"
                      value={activeProduction.sessionDate}
                      onChange={(event) => patchActiveProduction({ sessionDate: event.target.value })}
                    />
                  </label>
                  <label>
                    Planned duration
                    <input
                      value={activeProduction.studioDuration}
                      onChange={(event) => patchActiveProduction({ studioDuration: event.target.value })}
                      placeholder="60 minutes"
                    />
                  </label>
                  <label className="full-span">
                    Recording path
                    <input
                      value={activeProduction.recordingPath}
                      onChange={(event) => patchActiveProduction({ recordingPath: event.target.value })}
                      placeholder="Local folder, drive path, or handoff location"
                    />
                  </label>
                </div>
              </div>

              <div className="details-panel">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">Crew</p>
                    <h2>People on the session</h2>
                  </div>
                </div>
                <div className="field-grid">
                  {(Object.keys(crewLabels) as CrewRole[]).map((role) => (
                    <label key={role}>
                      {crewLabels[role]}
                      <input
                        value={activeProduction.crew[role]}
                        onChange={(event) => patchCrew(role, event.target.value)}
                        placeholder="Name"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="details-panel full-span">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">Handoff notes</p>
                    <h2>Editor context</h2>
                  </div>
                </div>
                <div className="long-fields">
                  <label>
                    Notes for editor
                    <textarea
                      value={activeProduction.notesForEditor}
                      onChange={(event) => patchActiveProduction({ notesForEditor: event.target.value })}
                      placeholder="Key beats, callouts, and delivery instructions"
                    />
                  </label>
                  <label>
                    ISO / record details
                    <textarea
                      value={activeProduction.isoRecordDetails}
                      onChange={(event) => patchActiveProduction({ isoRecordDetails: event.target.value })}
                      placeholder="Record channels, file names, and sync details"
                    />
                  </label>
                  <label>
                    Additional notes
                    <textarea
                      value={activeProduction.additionalNotes}
                      onChange={(event) => patchActiveProduction({ additionalNotes: event.target.value })}
                      placeholder="Anything else that should travel with the export"
                    />
                  </label>
                </div>
              </div>
            </section>
          )}

          {activeTab === "export" && (
            <section className="tab-panel export-grid">
              <div className="export-panel">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">Export</p>
                    <h2>Clean handoff files</h2>
                  </div>
                  <span className="status-pill">{fontOptions.find((option) => option.id === fontChoice)?.label} font</span>
                </div>
                <div className="export-actions">
                  <button type="button" onClick={() => exportPdf(activeProduction, exportOptions)}>
                    <FileText size={18} aria-hidden="true" />
                    PDF
                  </button>
                  <button type="button" onClick={() => exportCsv(activeProduction)}>
                    <Download size={18} aria-hidden="true" />
                    CSV
                  </button>
                  <button type="button" onClick={() => exportMarkdown(activeProduction, exportOptions)}>
                    <FileText size={18} aria-hidden="true" />
                    Markdown
                  </button>
                  <button type="button" onClick={() => exportProductionBackup(activeProduction)}>
                    <FileArchive size={18} aria-hidden="true" />
                    Session JSON
                  </button>
                  <button type="button" onClick={() => exportWorkspaceBackup(productions)}>
                    <FileArchive size={18} aria-hidden="true" />
                    Workspace JSON
                  </button>
                </div>
              </div>

              <div className="export-panel">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">Summary</p>
                    <h2>{activeProduction.title || "Untitled Session"}</h2>
                  </div>
                </div>
                <dl className="summary-grid">
                  <div>
                    <dt>Date</dt>
                    <dd>{compactDate(activeProduction.sessionDate)}</dd>
                  </div>
                  <div>
                    <dt>Active notes</dt>
                    <dd>{activeNoteCount(activeProduction)}</dd>
                  </div>
                  <div>
                    <dt>Elapsed</dt>
                    <dd>{formatDuration(targetSnapshot.activeMs)}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{formatZonedDateTime(activeProduction.updatedAtUtc, "America/Los_Angeles")}</dd>
                  </div>
                </dl>
              </div>

              <div className="export-panel full-span">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">Export preview</p>
                    <h2>Manual context</h2>
                  </div>
                </div>
                <pre className="preview-box">
                  {[activeProduction.notesForEditor, activeProduction.isoRecordDetails, activeProduction.additionalNotes]
                    .map((value) => value.trim())
                    .filter(Boolean)
                    .join("\n\n") || "No manual context yet."}
                </pre>
              </div>
            </section>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
