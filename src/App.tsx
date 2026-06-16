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
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  TimerReset,
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

function timerElapsedMs(timer: TargetTimer, nowMs = Date.now()) {
  const activeRun =
    timer.status === "running" && timer.lastStartedAtUtc
      ? nowMs - new Date(timer.lastStartedAtUtc).getTime()
      : 0;

  return Math.max(0, timer.accumulatedMs + activeRun);
}

function timerStatusLabel(timer: TargetTimer) {
  if (timer.status === "running") return "Running";
  if (timer.status === "paused") return "Paused";
  if (timer.status === "complete") return "Complete";
  return "Ready";
}

function activeNoteCount(production: Production) {
  return production.noteLogs.filter((note) => !note.deletedAtUtc).length;
}

function eventKind(eventType: string): QuickActionTone {
  const normalized = eventType.toLowerCase();
  if (normalized.includes("issue") || normalized.includes("flag") || normalized.includes("problem")) {
    return "issue";
  }
  if (normalized.includes("timer")) {
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

  const elapsedMs = timerElapsedMs(activeProduction.targetTimer, nowMs);
  const targetMs = activeProduction.targetTimer.targetMinutes * 60 * 1000;
  const targetProgress = targetMs > 0 ? Math.min(100, (elapsedMs / targetMs) * 100) : 0;

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

  function updateTimerStatus(action: "start" | "pause" | "complete" | "reset") {
    const timer = activeProduction.targetTimer;
    const now = nowUtcIso();
    const currentElapsed = timerElapsedMs(timer);

    if (action === "start") {
      const isResume = timer.status === "paused";
      patchTimer({
        ...timer,
        status: "running",
        actualStartUtc: timer.actualStartUtc || now,
        lastStartedAtUtc: now,
        pauseStartedAtUtc: undefined
      });
      addSystemNote(isResume ? "Timer Resumed" : "Timer Started", isResume ? "Timer resumed." : "Timer started.");
      return;
    }

    if (action === "pause" && timer.status === "running") {
      patchTimer({
        ...timer,
        status: "paused",
        accumulatedMs: currentElapsed,
        lastStartedAtUtc: undefined,
        pauseStartedAtUtc: now,
        pauseCount: timer.pauseCount + 1
      });
      addSystemNote("Timer Paused", "Timer paused.");
      return;
    }

    if (action === "complete") {
      patchTimer({
        ...timer,
        status: "complete",
        accumulatedMs: currentElapsed,
        lastStartedAtUtc: undefined,
        completedAtUtc: now
      });
      addSystemNote("Timer Complete", `Timer completed at ${formatElapsed(currentElapsed)}.`);
      return;
    }

    if (action === "reset") {
      patchTimer({
        ...timer,
        status: "idle",
        actualStartUtc: undefined,
        completedAtUtc: undefined,
        accumulatedMs: 0,
        lastStartedAtUtc: undefined,
        pauseStartedAtUtc: undefined,
        pauseCount: 0
      });
      addSystemNote("Timer Reset", "Timer reset.");
    }
  }

  function updateTimerTarget(value: string) {
    const minutes = Math.max(1, Number.parseInt(value, 10) || 1);
    patchTimer({
      ...activeProduction.targetTimer,
      targetMinutes: minutes
    });
  }

  function updateTimerStart(value: string) {
    patchTimer({
      ...activeProduction.targetTimer,
      scheduledStartTime: value,
      scheduledStartMode: "manual"
    });
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
                    <p className="section-kicker">Run clock</p>
                    <h2>{timerStatusLabel(activeProduction.targetTimer)}</h2>
                  </div>
                  <span className="status-pill">{formatElapsed(elapsedMs)}</span>
                </div>
                <div className="timer-track" aria-label="Timer progress">
                  <span style={{ width: `${targetProgress}%` }} />
                </div>
                <div className="timer-meta">
                  <label>
                    Target minutes
                    <input
                      type="number"
                      min="1"
                      value={activeProduction.targetTimer.targetMinutes}
                      onChange={(event) => updateTimerTarget(event.target.value)}
                    />
                  </label>
                  <label>
                    Scheduled start
                    <input
                      type="time"
                      value={activeProduction.targetTimer.scheduledStartTime}
                      onChange={(event) => updateTimerStart(event.target.value)}
                    />
                  </label>
                </div>
                <div className="timer-actions">
                  <button type="button" onClick={() => updateTimerStatus("start")}>
                    <Play size={17} aria-hidden="true" />
                    Start
                  </button>
                  <button type="button" onClick={() => updateTimerStatus("pause")}>
                    <Pause size={17} aria-hidden="true" />
                    Pause
                  </button>
                  <button type="button" onClick={() => updateTimerStatus("complete")}>
                    <CheckCircle2 size={17} aria-hidden="true" />
                    Complete
                  </button>
                  <button type="button" onClick={() => updateTimerStatus("reset")}>
                    <TimerReset size={17} aria-hidden="true" />
                    Reset
                  </button>
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
                    <dd>{formatElapsed(elapsedMs)}</dd>
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
