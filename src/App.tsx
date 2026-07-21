import {
  CheckCircle2,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  Flag,
  FolderOpen,
  HardDrive,
  Maximize2,
  MicOff,
  MonitorX,
  Palette,
  PauseCircle,
  PlayCircle,
  Plus,
  Radio,
  RotateCcw,
  Save,
  Search,
  Settings,
  Square,
  Trash2,
  Users,
  Video,
  X,
  type LucideIcon
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  exportCsv,
  exportPdf
} from "./exporters";
import {
  collectRosterNames,
  collectSavableRosterNames,
  createBlankProduction,
  createDefaultTargetTimer,
  createStarterProduction,
  crewLabels,
  defaultRecordingPath,
  hasLocalStorageFailure,
  loadActiveCode,
  loadOperatorName,
  loadProductions,
  normalizeCode,
  readLocalStorage,
  saveActiveCode,
  saveOperatorName,
  saveProductions,
  sanitizeProductions,
  summarizeProduction,
  uid,
  writeLocalStorage
} from "./storage";
import { compactDate, formatZonedDateTime, nowUtcIso } from "./time";
import type { CrewRole, NoteLog, Production, SortMode, TargetTimer } from "./types";

interface EventButton {
  id: string;
  label: string;
  helper: string;
  icon: LucideIcon;
  tone: string;
  group: QuickButtonGroup;
}

type QuickButtonGroup = "event" | "issue";

const defaultEventButtons: EventButton[] = [
  { id: "segment-start", label: "Segment Start", helper: "Begin segment", icon: PlayCircle, tone: "segment-start", group: "event" },
  { id: "segment-end", label: "Segment End", helper: "End segment", icon: Square, tone: "segment-end", group: "event" },
  { id: "iso-intro", label: "ISO Intro", helper: "Intro ISO marker", icon: PlayCircle, tone: "blue", group: "event" },
  { id: "iso-outro", label: "ISO Outro", helper: "Outro ISO marker", icon: Flag, tone: "blue", group: "event" },
  { id: "intro", label: "Intro", helper: "Open or pickup intro", icon: PlayCircle, tone: "teal", group: "event" },
  { id: "retake", label: "Retake", helper: "Repeat needed", icon: RotateCcw, tone: "amber", group: "event" },
  { id: "good-take", label: "Good Take", helper: "Usable take", icon: CheckCircle2, tone: "green", group: "issue" },
  { id: "tail-slate", label: "Tail Slate", helper: "Slate at end", icon: Flag, tone: "teal", group: "event" },
  { id: "audio-issue", label: "Audio Issue", helper: "Mic, mix, feedback", icon: MicOff, tone: "red", group: "issue" },
  { id: "zoom-issue", label: "Zoom Issue", helper: "Remote guest / record", icon: MonitorX, tone: "blue", group: "issue" },
  { id: "video-drop", label: "Video Drop", helper: "Camera or monitor", icon: Video, tone: "red", group: "issue" },
  { id: "noise", label: "Noise", helper: "Room or prop noise", icon: Radio, tone: "amber", group: "issue" },
  { id: "editor-note", label: "Editor Note", helper: "Editorial handoff", icon: Edit3, tone: "green", group: "issue" },
  { id: "custom", label: "Custom", helper: "Use typed note", icon: Plus, tone: "slate", group: "issue" }
];
const broadcastName = "studio-super-dashboard";
const sourceId = uid("tab");
const starterCode = "new-production";
const targetMinuteOptions = [30, 45, 60, 75, 90, 120, 150, 180];
const pacificTimeZone = "America/Los_Angeles";
const studioSuperWordmarkDarkSrc = `${import.meta.env.BASE_URL}brand/studio-super-wordmark.png`;
const studioSuperWordmarkLightSrc = `${import.meta.env.BASE_URL}brand/studio-super-wordmark-light.png`;
const quickButtonsKey = "studio-super:quick-buttons:v9";
const fontChoiceKey = "studio-super:font-choice:v9";
const themeChoiceKey = "studio-super:theme-choice:v10";
const modeChoiceKey = "studio-super:mode-choice:v10";
const accentChoiceKey = "studio-super:accent-choice:v10";
const retiredQuickButtonIds = new Set(["record-start"]);

const pinnedQuickButtonIds = ["segment-start", "segment-end", "iso-intro", "iso-outro"];

type DashboardTab = "log" | "details" | "settings" | "export";
type StartupMode = "choose" | "new" | "open";
type MobilePanel = "buttons" | "timeline";

const fontChoices = [
  { label: "Modern", value: "modern" },
  { label: "Classic", value: "classic" },
  { label: "Mono", value: "mono" },
  { label: "Editorial", value: "editorial" },
  { label: "Wide", value: "wide" }
] as const;

type FontChoice = (typeof fontChoices)[number]["value"];

const modeChoices = [
  { label: "Dark", value: "dark" },
  { label: "Light", value: "light" }
] as const;

type ModeChoice = (typeof modeChoices)[number]["value"];

const accentChoices = [
  { label: "Theme", value: "theme", swatch: "#e4002b" },
  { label: "Teal", value: "teal", swatch: "#00f5d4" },
  { label: "Gold", value: "gold", swatch: "#ffc600" },
  { label: "Crimson", value: "crimson", swatch: "#e4002b" },
  { label: "Violet", value: "violet", swatch: "#9b5cff" }
] as const;

type AccentChoice = (typeof accentChoices)[number]["value"];

const themeChoices = [
  {
    label: "Studio Super",
    value: "studio-super",
    summary: "black, signal red, studio gold",
    defaultMode: "dark",
    defaultFont: "modern",
    swatches: ["#020202", "#e4002b", "#ffc600"]
  },
  {
    label: "Cyberpunk",
    value: "cyberpunk",
    summary: "electric yellow, teal, hot magenta",
    defaultMode: "dark",
    defaultFont: "wide",
    swatches: ["#05020d", "#faff00", "#00f5d4"]
  },
  {
    label: "Crimson Crown",
    value: "crimson-crown",
    summary: "royal red, burnished gold, deep wine",
    defaultMode: "dark",
    defaultFont: "classic",
    swatches: ["#100104", "#b11226", "#f1c453"]
  },
  {
    label: "Aurora Glass",
    value: "aurora-glass",
    summary: "glacial cyan, violet, soft green",
    defaultMode: "dark",
    defaultFont: "modern",
    swatches: ["#061113", "#76e4f7", "#b985ff"]
  },
  {
    label: "Polar Slate",
    value: "polar-slate",
    summary: "clean slate, ice blue, graphite",
    defaultMode: "light",
    defaultFont: "modern",
    swatches: ["#f4f8fb", "#2563eb", "#0f172a"]
  },
  {
    label: "Solar Cream",
    value: "solar-cream",
    summary: "warm paper, navy ink, amber",
    defaultMode: "light",
    defaultFont: "editorial",
    swatches: ["#fbf2db", "#19324a", "#e0a100"]
  },
  {
    label: "Graphite Lime",
    value: "graphite-lime",
    summary: "charcoal, laser lime, mint",
    defaultMode: "dark",
    defaultFont: "mono",
    swatches: ["#050807", "#b8ff36", "#00d8a7"]
  },
  {
    label: "Royal Amethyst",
    value: "royal-amethyst",
    summary: "deep violet, champagne, ink",
    defaultMode: "dark",
    defaultFont: "classic",
    swatches: ["#10061d", "#8b5cf6", "#f5c76a"]
  },
  {
    label: "Oceanic Coral",
    value: "oceanic-coral",
    summary: "navy depth, clean cyan, coral",
    defaultMode: "dark",
    defaultFont: "modern",
    swatches: ["#03111f", "#00a8e8", "#ff6f61"]
  },
  {
    label: "Rose Noir",
    value: "rose-noir",
    summary: "black cherry, rose, champagne",
    defaultMode: "dark",
    defaultFont: "editorial",
    swatches: ["#090407", "#ff4d8d", "#f7d9c4"]
  }
] as const;

type ThemeChoice = (typeof themeChoices)[number]["value"];

interface StoredEventButton {
  id: string;
  label: string;
  helper?: string;
  tone?: string;
  group?: QuickButtonGroup;
}

function inferQuickButtonGroup(label: string): QuickButtonGroup {
  const normalized = label.toLowerCase();
  if (
    normalized.includes("audio") ||
    normalized.includes("zoom") ||
    normalized.includes("video") ||
    normalized.includes("noise") ||
    normalized.includes("editor") ||
    normalized.includes("custom")
  ) {
    return "issue";
  }

  return "event";
}

function hydrateEventButton(stored: StoredEventButton, index: number): EventButton {
  const fallback = defaultEventButtons[index] || defaultEventButtons.find((button) => button.id === stored.id);
  const label = stored.label || fallback?.label || "Custom";
  return {
    id: stored.id || fallback?.id || uid("quick"),
    label,
    helper: stored.helper || fallback?.helper || "Custom log",
    tone: stored.tone || fallback?.tone || "slate",
    icon: fallback?.icon || Plus,
    group: stored.group || fallback?.group || inferQuickButtonGroup(label)
  };
}

function loadQuickButtons() {
  try {
    const raw = readLocalStorage(quickButtonsKey);
    if (!raw) {
      return defaultEventButtons;
    }

    const parsed = JSON.parse(raw) as StoredEventButton[];
    const activeButtons = Array.isArray(parsed)
      ? parsed.filter((button) => !retiredQuickButtonIds.has(button.id)).map(hydrateEventButton)
      : [];
    if (activeButtons.length === 0) {
      return defaultEventButtons;
    }

    const existingIds = new Set(activeButtons.map((button) => button.id));
    const merged = [
      ...defaultEventButtons.filter((button) => pinnedQuickButtonIds.includes(button.id) && !existingIds.has(button.id)),
      ...activeButtons
    ];

    return merged.sort((a, b) => {
      const aPinned = pinnedQuickButtonIds.indexOf(a.id);
      const bPinned = pinnedQuickButtonIds.indexOf(b.id);
      if (aPinned !== -1 || bPinned !== -1) {
        return (aPinned === -1 ? 99 : aPinned) - (bPinned === -1 ? 99 : bPinned);
      }
      if (a.id === "custom") return 1;
      if (b.id === "custom") return -1;
      return 0;
    });
  } catch {
    return defaultEventButtons;
  }
}

function saveQuickButtons(buttons: EventButton[]) {
  const payload: StoredEventButton[] = buttons
    .filter((button) => !retiredQuickButtonIds.has(button.id))
    .map(({ id, label, helper, tone, group }) => ({ id, label, helper, tone, group }));
  return writeLocalStorage(quickButtonsKey, JSON.stringify(payload));
}

function quickButtonGroup(button: EventButton) {
  return button.group || inferQuickButtonGroup(button.label);
}

function loadStoredChoice<T extends string>(key: string, choices: readonly { value: T }[], fallback: T): T {
  const saved = readLocalStorage(key);
  return choices.some((choice) => choice.value === saved) ? (saved as T) : fallback;
}

function loadFontChoice(): FontChoice {
  return loadStoredChoice(fontChoiceKey, fontChoices, "modern");
}

function loadThemeChoice(): ThemeChoice {
  return loadStoredChoice(themeChoiceKey, themeChoices, "studio-super");
}

function loadModeChoice(): ModeChoice {
  return loadStoredChoice(modeChoiceKey, modeChoices, "dark");
}

function loadAccentChoice(): AccentChoice {
  return loadStoredChoice(accentChoiceKey, accentChoices, "theme");
}

function padTimePart(value: number) {
  return String(value).padStart(2, "0");
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
  return `${padTimePart(parts.hour)}:${padTimePart(parts.minute)}:${padTimePart(parts.second)}`;
}

function formatEditableTimecode(date = new Date(), timeZone = pacificTimeZone) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone
  }).format(date);
}

function timecodeToZonedDate(value: string, baseIso: string, timeZone = pacificTimeZone) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  const meridiem = match[4]?.toUpperCase();

  if (minutes > 59 || seconds > 59 || hours > 23 || hours < 0) {
    return null;
  }

  if (meridiem) {
    if (hours < 1 || hours > 12) {
      return null;
    }
    if (meridiem === "AM") {
      hours = hours === 12 ? 0 : hours;
    } else {
      hours = hours === 12 ? 12 : hours + 12;
    }
  }

  return timeInputToZonedDate(`${padTimePart(hours)}:${padTimePart(minutes)}:${padTimePart(seconds)}`, baseIso, timeZone);
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
  const lateMs = scheduledStart && actualStart ? actualStart.getTime() - scheduledStart.getTime() : 0;
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
    lateMs,
    slipMs,
    isComplete: activeMs >= targetMs
  };
}

function normalizeNameMatch(value: string) {
  return value.trim().toLowerCase();
}

function nameScore(name: string, query: string) {
  const normalizedName = normalizeNameMatch(name);
  const normalizedQuery = normalizeNameMatch(query);
  if (!normalizedQuery) {
    return 20;
  }

  const parts = normalizedName.split(/\s+/).filter(Boolean);
  const first = parts[0] || "";
  const last = parts[parts.length - 1] || "";
  const initials = parts.map((part) => part[0]).join("");

  if (normalizedName === normalizedQuery) return 0;
  if (normalizedName.startsWith(normalizedQuery)) return 1;
  if (first.startsWith(normalizedQuery)) return 2;
  if (last.startsWith(normalizedQuery)) return 3;
  if (initials.startsWith(normalizedQuery)) return 4;
  if (parts.some((part) => part.startsWith(normalizedQuery))) return 5;
  if (normalizedName.includes(normalizedQuery)) return 6;
  return 99;
}

function rankNames(names: string[], query: string) {
  const normalizedQuery = normalizeNameMatch(query);
  return names
    .filter((name) => !normalizedQuery || nameScore(name, normalizedQuery) < 99)
    .sort((a, b) => nameScore(a, normalizedQuery) - nameScore(b, normalizedQuery) || a.localeCompare(b))
    .slice(0, 8);
}

function shortNameBase(input: string, fallback = "production") {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

  return normalized || fallback;
}

function removeSequenceSuffix(input: string) {
  return input.replace(/(?:_|-)\d+$/u, "") || input;
}

function sequenceTitle(title: string, sequence: number) {
  const trimmed = title.trim();
  if (!trimmed || sequence <= 1) {
    return trimmed;
  }

  return `${trimmed.replace(/\s+\d+$/u, "")} ${sequence}`;
}

function nextProductionIdentity(
  productions: Production[],
  titleInput: string,
  shortSeedInput?: string
) {
  const baseShortName = removeSequenceSuffix(shortNameBase(shortSeedInput || titleInput));
  const usedShortNames = new Set(productions.map((production) => production.shortName.trim().toLowerCase()).filter(Boolean));
  const usedCodes = new Set(productions.map((production) => production.code.trim().toLowerCase()).filter(Boolean));
  let sequence = 1;
  let shortName = baseShortName;

  while (usedShortNames.has(shortName.toLowerCase())) {
    sequence += 1;
    shortName = `${baseShortName}_${sequence}`;
  }

  const baseCode = normalizeCode(shortName.replace(/_/g, "-")) || "production";
  let code = baseCode;
  let codeSequence = sequence;

  while (usedCodes.has(code)) {
    codeSequence += 1;
    code = `${baseCode}-${codeSequence}`;
  }

  return {
    code,
    shortName,
    title: sequenceTitle(titleInput, sequence)
  };
}

interface NameAutocompleteProps {
  label: string;
  value: string;
  names: string[];
  placeholder: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  className?: string;
  hideLabel?: boolean;
  inputAriaLabel?: string;
  commitOnBlur?: boolean;
  commitOnEnter?: boolean;
}

function NameAutocomplete({
  label,
  value,
  names,
  placeholder,
  onChange,
  onCommit,
  className = "",
  hideLabel = false,
  inputAriaLabel,
  commitOnBlur = true,
  commitOnEnter = true
}: NameAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const suggestions = rankNames(names, value);
  const trimmedValue = value.trim();
  const exactMatch = names.some((name) => normalizeNameMatch(name) === normalizeNameMatch(trimmedValue));
  const showNewOption = trimmedValue.length > 1 && !exactMatch;
  const showMenu = open && (suggestions.length > 0 || showNewOption);

  function commit(nextValue = value) {
    const trimmed = nextValue.trim();
    if (trimmed) {
      onCommit(trimmed);
    }
  }

  return (
    <label className={`name-combobox ${hideLabel ? "name-combobox-compact" : ""} ${className}`.trim()}>
      {!hideLabel && label}
      <div className="name-combobox-shell">
        <input
          aria-label={inputAriaLabel || label}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
            if (commitOnBlur) {
              commit();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (commitOnEnter) {
                commit();
              }
              setOpen(false);
            }
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {showMenu && (
          <div className="name-menu" role="listbox">
            {suggestions.map((name) => (
              <button
                key={name}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(name);
                  onCommit(name);
                  setOpen(false);
                }}
              >
                <span>{name}</span>
                <small>Saved name</small>
              </button>
            ))}
            {showNewOption && (
              <button
                type="button"
                className="new-name-option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(trimmedValue);
                  onCommit(trimmedValue);
                  setOpen(false);
                }}
              >
                <span>{trimmedValue}</span>
                <small>Save as new name</small>
              </button>
            )}
          </div>
        )}
      </div>
    </label>
  );
}

function App() {
  const [productions, setProductions] = useState<Production[]>(() => loadProductions());
  const [activeCode, setActiveCode] = useState(() => loadActiveCode(starterCode));
  const [operatorName, setOperatorName] = useState("");
  const [operatorDraft, setOperatorDraft] = useState(() => loadOperatorName());
  const [nowIso, setNowIso] = useState(() => nowUtcIso());
  const [sortMode, setSortMode] = useState<SortMode>("date");
  const [productionSearch, setProductionSearch] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinTitle, setJoinTitle] = useState("");
  const [timelineSearch, setTimelineSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [editingId, setEditingId] = useState("");
  const [editingText, setEditingText] = useState("");
  const [activeTab, setActiveTab] = useState<DashboardTab>("log");
  const selectedTimeZone = pacificTimeZone;
  const [fontChoice, setFontChoice] = useState<FontChoice>(() => loadFontChoice());
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() => loadThemeChoice());
  const [modeChoice, setModeChoice] = useState<ModeChoice>(() => loadModeChoice());
  const [accentChoice, setAccentChoice] = useState<AccentChoice>(() => loadAccentChoice());
  const [designMenuOpen, setDesignMenuOpen] = useState(false);
  const [quickButtons, setQuickButtons] = useState<EventButton[]>(() => loadQuickButtons());
  const [newQuickButtonLabel, setNewQuickButtonLabel] = useState("");
  const [newQuickButtonGroup, setNewQuickButtonGroup] = useState<QuickButtonGroup>("event");
  const [crewSaveStatus, setCrewSaveStatus] = useState<"idle" | "saved">("idle");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("buttons");
  const [startupMode, setStartupMode] = useState<StartupMode>("choose");
  const [startupProductionTitle, setStartupProductionTitle] = useState("");
  const [startupExistingCode, setStartupExistingCode] = useState(() => loadActiveCode(starterCode));
  const [copyToast, setCopyToast] = useState("");
  const [storageWriteFailed, setStorageWriteFailed] = useState(() => hasLocalStorageFailure());
  const [fullScreenClockOpen, setFullScreenClockOpen] = useState(false);

  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const suppressBroadcastRef = useRef(false);
  const localSessionOverrideRef = useRef(false);
  const designMenuRef = useRef<HTMLDivElement | null>(null);
  const copyToastTimerRef = useRef<number | null>(null);
  const activeCodeRef = useRef(activeCode);
  const productionsRef = useRef(productions);
  activeCodeRef.current = activeCode;
  productionsRef.current = productions;

  const activeCodeExists = productions.some((production) => production.code === activeCode);
  const activeProduction = productions.find((production) => production.code === activeCode) || productions[0];
  const activeShortName = activeProduction?.shortName || activeProduction?.code || starterCode;
  const activeDesignTheme = themeChoices.find((theme) => theme.value === themeChoice) || themeChoices[0];
  const manualExportNotes = useMemo(
    () => {
      if (!activeProduction) {
        return "";
      }

      if (activeProduction.notesForEditor || (!activeProduction.isoRecordDetails && !activeProduction.additionalNotes)) {
        return activeProduction.notesForEditor;
      }

      return [activeProduction.isoRecordDetails, activeProduction.additionalNotes]
        .filter((value) => value.trim())
        .join("\n\n");
    },
    [activeProduction]
  );
  const targetTimer = activeProduction?.targetTimer || createDefaultTargetTimer();
  const targetSnapshot = useMemo(
    () => buildTargetSnapshot(targetTimer, nowIso, selectedTimeZone),
    [nowIso, selectedTimeZone, targetTimer]
  );
  const scheduledStartInputValue =
    targetTimer.scheduledStartMode !== "manual" && !targetTimer.actualStartUtc && targetTimer.status === "idle"
      ? dateToTimeInput(new Date(nowIso), selectedTimeZone)
      : targetTimer.scheduledStartTime;
  const targetStatus =
    targetTimer.status === "running" && targetSnapshot.remainingMs < 0
      ? "Over target duration"
      : targetTimer.status === "complete"
      ? "Target duration reached"
      : targetTimer.status === "running"
        ? "Running"
        : targetTimer.status === "paused"
          ? "Paused"
          : "Ready";
  const targetOptions = targetMinuteOptions.includes(targetTimer.targetMinutes)
    ? targetMinuteOptions
    : [...targetMinuteOptions, targetTimer.targetMinutes].sort((a, b) => a - b);

  async function copyStaticValue(value: string) {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(trimmedValue);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = trimmedValue;
        textArea.setAttribute("readonly", "true");
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
      setCopyToast("Copied to clipboard");
    } catch {
      setCopyToast("Could not copy");
    }

    if (copyToastTimerRef.current) {
      window.clearTimeout(copyToastTimerRef.current);
    }
    copyToastTimerRef.current = window.setTimeout(() => setCopyToast(""), 1500);
  }

  function CopyableValue({
    value,
    label,
    className = "",
    children
  }: {
    value: string;
    label: string;
    className?: string;
    children?: ReactNode;
  }) {
    return (
      <span
        className={`copyable-value ${className}`.trim()}
        role="button"
        tabIndex={0}
        title={`Copy ${label}`}
        aria-label={`Copy ${label}`}
        onClick={() => void copyStaticValue(value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            void copyStaticValue(value);
          }
        }}
      >
        {children || value}
      </span>
    );
  }

  function applyThemePreset(nextTheme: ThemeChoice) {
    const preset = themeChoices.find((theme) => theme.value === nextTheme) || themeChoices[0];
    setThemeChoice(preset.value);
    setModeChoice(preset.defaultMode);
    setFontChoice(preset.defaultFont);
    setAccentChoice("theme");
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNowIso(nowUtcIso()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!fullScreenClockOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFullScreenClockOpen(false);
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [fullScreenClockOpen]);

  useEffect(() => {
    return () => {
      if (copyToastTimerRef.current) {
        window.clearTimeout(copyToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function keepTextEntryVisible(event: FocusEvent) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
        return;
      }

      window.setTimeout(() => {
        target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      }, 80);
    }

    document.addEventListener("focusin", keepTextEntryVisible);
    return () => document.removeEventListener("focusin", keepTextEntryVisible);
  }, []);

  useEffect(() => {
    if (!saveQuickButtons(quickButtons)) {
      setStorageWriteFailed(true);
    }
  }, [quickButtons]);

  useEffect(() => {
    if (!writeLocalStorage(fontChoiceKey, fontChoice)) {
      setStorageWriteFailed(true);
    }
    document.documentElement.dataset.font = fontChoice;
  }, [fontChoice]);

  useEffect(() => {
    const saved = [
      writeLocalStorage(themeChoiceKey, themeChoice),
      writeLocalStorage(modeChoiceKey, modeChoice),
      writeLocalStorage(accentChoiceKey, accentChoice)
    ].every(Boolean);
    if (!saved) {
      setStorageWriteFailed(true);
    }
    document.documentElement.dataset.theme = themeChoice;
    document.documentElement.dataset.mode = modeChoice;
    document.documentElement.dataset.accent = accentChoice;
  }, [accentChoice, modeChoice, themeChoice]);

  useEffect(() => {
    if (!designMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target;
      if (target instanceof Node && designMenuRef.current && !designMenuRef.current.contains(target)) {
        setDesignMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDesignMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [designMenuOpen]);

  useEffect(() => {
    setProductions((current) => {
      const sanitized = sanitizeProductions(current);
      return JSON.stringify(sanitized) === JSON.stringify(current) ? current : sanitized;
    });
  }, []);

  useEffect(() => {
    if (!activeCodeExists && productions.length > 0) {
      setActiveCode(productions[0].code);
    }
  }, [activeCodeExists, productions]);

  useEffect(() => {
    if (!saveActiveCode(activeCode)) {
      setStorageWriteFailed(true);
    }
  }, [activeCode]);

  useEffect(() => {
    if (!saveProductions(productions)) {
      setStorageWriteFailed(true);
    }
    if (suppressBroadcastRef.current) {
      suppressBroadcastRef.current = false;
      return;
    }

    broadcastRef.current?.postMessage({
      type: "productions",
      sourceId,
      productions
    });
  }, [productions]);

  useEffect(() => {
    if (typeof window.BroadcastChannel !== "function") {
      return;
    }

    let channel: BroadcastChannel;
    try {
      channel = new window.BroadcastChannel(broadcastName);
    } catch {
      return;
    }

    broadcastRef.current = channel;
    channel.addEventListener("message", (event) => {
      const payload = event.data as { type?: string; sourceId?: string; productions?: Production[] };
      if (payload.sourceId === sourceId || payload.type !== "productions" || !payload.productions) {
        return;
      }

      const incomingProductions = sanitizeProductions(payload.productions);
      if (
        localSessionOverrideRef.current &&
        !incomingProductions.some((production) => production.code === activeCodeRef.current)
      ) {
        return;
      }

      suppressBroadcastRef.current = true;
      setProductions(incomingProductions);
    });

    return () => {
      channel.close();
      broadcastRef.current = null;
    };
  }, []);

  const summaries = useMemo(() => {
    const query = productionSearch.trim().toLowerCase();
    const filtered = productions
      .map(summarizeProduction)
      .filter((summary) =>
        [summary.title, summary.shortName, summary.code, summary.sessionDate]
          .join(" ")
          .toLowerCase()
          .includes(query)
      );

    return filtered.sort((a, b) => {
      if (sortMode === "noteCount") {
        return b.noteCount - a.noteCount || a.title.localeCompare(b.title);
      }

      if (sortMode === "date") {
        return (b.sessionDate || "").localeCompare(a.sessionDate || "") || a.title.localeCompare(b.title);
      }

      return a[sortMode].localeCompare(b[sortMode]);
    });
  }, [productionSearch, productions, sortMode]);

  const activeRoster = useMemo(
    () => (activeProduction ? collectRosterNames(activeProduction) : []),
    [activeProduction]
  );

  const quickButtonToneByLabel = useMemo(() => {
    const entries = [...defaultEventButtons, ...quickButtons].map((button) => [button.label.toLowerCase(), button.tone] as const);
    return new Map(entries);
  }, [quickButtons]);

  const quickButtonKindByLabel = useMemo(() => {
    const entries = [...defaultEventButtons, ...quickButtons].map((button) => [
      button.label.toLowerCase(),
      quickButtonGroup(button)
    ] as const);
    return new Map(entries);
  }, [quickButtons]);

  const eventQuickButtons = useMemo(
    () => quickButtons.filter((button) => quickButtonGroup(button) === "event"),
    [quickButtons]
  );

  const issueQuickButtons = useMemo(
    () => quickButtons.filter((button) => quickButtonGroup(button) === "issue"),
    [quickButtons]
  );

  const savedNameOptions = useMemo(() => {
    const names = productions.flatMap((production) => [
      ...production.rosterNames,
      ...Object.values(production.crew),
      ...production.noteLogs.map((note) => note.operatorName),
      operatorName
    ]);
    return Array.from(new Set(names.map((name) => name.trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [operatorName, productions]);

  const noteTypes = useMemo(() => {
    const labels = activeProduction?.noteLogs.map((note) => note.eventType) || [];
    return ["All", ...Array.from(new Set([...quickButtons.map((button) => button.label), ...labels]))];
  }, [activeProduction, quickButtons]);

  const visibleNotes = useMemo(() => {
    if (!activeProduction) {
      return [];
    }

    const query = timelineSearch.trim().toLowerCase();
    return activeProduction.noteLogs
      .filter((note) => !note.deletedAtUtc)
      .filter((note) => typeFilter === "All" || note.eventType === typeFilter)
      .filter((note) =>
        [note.eventType, note.text, note.operatorName]
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
      .sort((a, b) => b.utcIso.localeCompare(a.utcIso));
  }, [activeProduction, timelineSearch, typeFilter]);
  const latestRecordMarker = useMemo(() => {
    if (!activeProduction) {
      return null;
    }

    return activeProduction.noteLogs
      .filter((note) => !note.deletedAtUtc && (note.eventType === "Record Start" || note.eventType === "Record Stop"))
      .sort((a, b) => b.utcIso.localeCompare(a.utcIso))[0] || null;
  }, [activeProduction]);
  const recordControlState =
    latestRecordMarker?.eventType === "Record Start"
      ? "recording"
      : latestRecordMarker?.eventType === "Record Stop"
        ? "stopped"
        : "idle";
  const recordControlLabel = recordControlState === "recording" ? "Record Stop" : "Record Start";
  const recordControlCaption =
    recordControlState === "recording"
      ? "Recording live"
      : recordControlState === "stopped"
        ? "Stopped"
        : "Ready";

  useEffect(() => {
    if (summaries.some((summary) => summary.code === startupExistingCode)) {
      return;
    }

    setStartupExistingCode(summaries[0]?.code || activeCode);
  }, [activeCode, startupExistingCode, summaries]);

  function commitOperatorName(nextName = operatorDraft) {
    const trimmed = nextName.trim();
    if (!trimmed) {
      return;
    }

    setOperatorName(trimmed);
    setOperatorDraft(trimmed);
    if (!saveOperatorName(trimmed)) {
      setStorageWriteFailed(true);
    }
  }

  function noteTone(eventType: string) {
    const normalized = eventType.toLowerCase();
    if (normalized.includes("segment start")) return "segment-start";
    if (normalized.includes("segment end")) return "segment-end";
    if (normalized.includes("audio") || normalized.includes("video")) return "red";
    if (normalized.includes("zoom") || normalized.includes("iso") || normalized.includes("intro") || normalized.includes("outro")) return "blue";
    if (normalized.includes("retake") || normalized.includes("noise")) return "amber";
    if (normalized.includes("good") || normalized.includes("editor")) return "green";
    return quickButtonToneByLabel.get(normalized) || "slate";
  }

  function noteKind(eventType: string): QuickButtonGroup {
    const normalized = eventType.toLowerCase();
    if (normalized.includes("record") || normalized.includes("segment") || normalized.includes("intro") || normalized.includes("outro")) {
      return "event";
    }
    return quickButtonKindByLabel.get(normalized) || inferQuickButtonGroup(eventType);
  }

  function setActiveProductionCode(code: string) {
    activeCodeRef.current = code;
    setActiveCode(code);
    if (!saveActiveCode(code)) {
      setStorageWriteFailed(true);
    }
  }

  function markLocalSessionChoice() {
    localSessionOverrideRef.current = true;
  }

  function updateActiveProduction(updater: (production: Production) => Production) {
    if (!activeProduction) {
      return;
    }

    setProductions((current) =>
      current.map((production) => {
        if (production.code !== activeProduction.code) {
          return production;
        }

        return {
          ...updater(production),
          updatedAtUtc: nowUtcIso()
        };
      })
    );
  }

  function timerNote(eventType: string, text: string, utcIso: string): NoteLog {
    const noteOperator = operatorName || "Target Clock";
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

  function updateTargetTimerWithNote(
    updater: (timer: TargetTimer, utcIso: string) => { timer: TargetTimer; text: string; eventType: string }
  ) {
    const utcIso = nowUtcIso();
    updateActiveProduction((production) => {
      const result = updater(production.targetTimer || createDefaultTargetTimer(), utcIso);
      const note = timerNote(result.eventType, result.text, utcIso);
      const noteLogs = [note, ...production.noteLogs];
      return {
        ...production,
        targetTimer: result.timer,
        noteLogs,
        rosterNames: collectRosterNames({ ...production, noteLogs })
      };
    });
  }

  function setTargetMinutes(minutes: number) {
    updateActiveProduction((production) => ({
      ...production,
      targetTimer: {
        ...(production.targetTimer || createDefaultTargetTimer()),
        targetMinutes: minutes
      }
    }));
  }

  function addTargetMinutes(minutes: number) {
    updateActiveProduction((production) => {
      const timer = production.targetTimer || createDefaultTargetTimer();
      return {
        ...production,
        targetTimer: {
          ...timer,
          targetMinutes: Math.max(1, timer.targetMinutes + minutes)
        }
      };
    });
  }

  function setScheduledStartTime(value: string) {
    updateActiveProduction((production) => ({
      ...production,
      targetTimer: {
        ...(production.targetTimer || createDefaultTargetTimer()),
        scheduledStartTime: value,
        scheduledStartMode: "manual"
      }
    }));
  }

  function startOrResumeTargetTimer() {
    updateTargetTimerWithNote((timer, utcIso) => {
      if (timer.status === "running") {
        return {
          timer,
          eventType: "Target Duration",
          text: "Target duration already running"
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
        eventType: "Target Duration Resume",
        text: `Target duration resumed after pause #${pauseCount} (${formatDurationLong(pauseMs)})`
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
        eventType: "Target Duration Start",
        text: `Target duration started: ${timer.targetMinutes} minute target`
      };
    });
  }

  function pauseTargetTimer() {
    updateTargetTimerWithNote((timer, utcIso) => {
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
        eventType: "Target Duration Pause",
        text: `Target duration paused at ${formatDuration(snapshot.activeMs)} active, ${formatRemaining(snapshot.remainingMs)} remaining`
      };
    });
  }

  function resetTargetTimer() {
    if (!window.confirm("Are you sure you want to reset the target duration for this production?")) {
      return;
    }

    updateTargetTimerWithNote((timer, utcIso) => ({
      timer: {
        ...createDefaultTargetTimer(),
        targetMinutes: timer.targetMinutes,
        scheduledStartTime: dateToTimeInput(new Date(utcIso), selectedTimeZone),
        scheduledStartMode: "auto",
        completedAtUtc: undefined
      },
      eventType: "Target Duration Reset",
      text: "Target duration reset"
    }));
  }

  function isBlankStarterProduction(production: Production) {
    return (
      production.code === starterCode &&
      !production.title.trim() &&
      !production.shortName.trim() &&
      production.noteLogs.length === 0
    );
  }

  function startNewProgram() {
    const name = operatorDraft.trim();
    if (!name) {
      return;
    }

    const title = startupProductionTitle.trim();
    const identity = nextProductionIdentity(productionsRef.current, title, title);
    const created = {
      ...createBlankProduction(identity.code, identity.title),
      title: identity.title,
      shortName: identity.shortName
    };

    const nextProductions = [
      created,
      ...productionsRef.current.filter((production) => production.code !== created.code && !isBlankStarterProduction(production))
    ];
    markLocalSessionChoice();
    productionsRef.current = nextProductions;
    setProductions(nextProductions);
    setActiveProductionCode(created.code);
    setStartupProductionTitle("");
    setStartupMode("choose");
    setActiveTab("log");
    commitOperatorName(name);
  }

  function startExistingProgram() {
    const name = operatorDraft.trim();
    const nextCode = startupExistingCode || summaries[0]?.code || activeProduction?.code;
    if (!name || !nextCode) {
      return;
    }

    markLocalSessionChoice();
    setActiveProductionCode(nextCode);
    setStartupMode("choose");
    setActiveTab("log");
    commitOperatorName(name);
  }

  function restartDashboard() {
    const confirmed = window.confirm(
      "Are you sure you want to restart? This creates a fresh Production Room. Previous rooms stay saved on this device."
    );
    if (!confirmed) {
      return;
    }

    const previous = activeProduction;
    const identity = nextProductionIdentity(
      productionsRef.current,
      previous?.title || "",
      previous?.shortName || previous?.title || "production"
    );
    const blank = createBlankProduction(identity.code, identity.title);
    const created = {
      ...blank,
      title: identity.title,
      shortName: identity.shortName,
      recordingPath: previous?.recordingPath || blank.recordingPath,
      crew: previous?.crew ? { ...previous.crew } : blank.crew,
      rosterNames: previous?.rosterNames ? [...previous.rosterNames] : []
    };
    const nextProductions = [
      created,
      ...productionsRef.current.filter((production) => production.code !== created.code && !isBlankStarterProduction(production))
    ];
    markLocalSessionChoice();
    productionsRef.current = nextProductions;
    setProductions(nextProductions);
    setActiveProductionCode(created.code);
    setStartupMode("new");
    setStartupProductionTitle("");
    setStartupExistingCode(created.code);
    setTimelineSearch("");
    setTypeFilter("All");
    setProductionSearch("");
    setJoinCode("");
    setJoinTitle("");
    setEditingId("");
    setEditingText("");
    setMobilePanel("buttons");
    setActiveTab("log");
  }

  function openOrCreateProduction() {
    const requestedName = joinCode.trim();
    if (!requestedName) {
      return;
    }

    const requestedCode = normalizeCode(requestedName);
    const requestedShortName = shortNameBase(requestedName);
    const existing = productions.find(
      (production) =>
        production.code === requestedCode ||
        production.shortName.trim().toLowerCase() === requestedShortName.toLowerCase()
    );
    if (existing) {
      markLocalSessionChoice();
      setActiveProductionCode(existing.code);
      setJoinCode("");
      setJoinTitle("");
      return;
    }

    const identity = nextProductionIdentity(productionsRef.current, joinTitle.trim(), requestedName);
    const created = {
      ...createBlankProduction(identity.code, identity.title),
      title: identity.title || joinTitle.trim(),
      shortName: identity.shortName
    };
    const nextProductions = [...productionsRef.current, created];
    markLocalSessionChoice();
    productionsRef.current = nextProductions;
    setProductions(nextProductions);
    setActiveProductionCode(created.code);
    setJoinCode("");
    setJoinTitle("");
  }

  function deleteProduction(code: string) {
    const target = productions.find((production) => production.code === code);
    if (!target) {
      return;
    }

    const label = target.title || target.shortName || target.code;
    const confirmed = window.confirm(`Delete "${label}" and all note logs? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    const remaining = productions.filter((production) => production.code !== code);
    const nextProductions = remaining.length > 0 ? remaining : [createStarterProduction()];
    const nextActiveCode = code === activeProduction.code ? nextProductions[0].code : activeProduction.code;

    suppressBroadcastRef.current = false;
    setProductions(nextProductions);
    setActiveProductionCode(nextActiveCode);
  }

  function logEvent(eventType: string) {
    if (!activeProduction || !operatorName.trim()) {
      return;
    }

    const utcIso = nowUtcIso();
    const text = `${eventType} logged`;
    const note: NoteLog = {
      id: uid("note"),
      eventType,
      text,
      operatorName,
      utcIso,
      history: [
        {
          id: uid("hist"),
          action: "create",
          operatorName,
          utcIso,
          nextText: text
        }
      ]
    };

    updateActiveProduction((production) => ({
      ...production,
      noteLogs: [note, ...production.noteLogs],
      rosterNames: collectRosterNames({ ...production, noteLogs: [note, ...production.noteLogs] })
    }));
  }

  function recordStop() {
    if (!activeProduction || !operatorName.trim()) {
      return;
    }

    const utcIso = nowUtcIso();
    updateActiveProduction((production) => {
      const recordStart = [...production.noteLogs]
        .filter((note) => note.eventType === "Record Start" && !note.deletedAtUtc)
        .sort((a, b) => b.utcIso.localeCompare(a.utcIso))[0];
      const durationText = recordStart
        ? formatDurationLong(Math.max(0, new Date(utcIso).getTime() - new Date(recordStart.utcIso).getTime()))
        : production.studioDuration;
      const text = recordStart ? `Record stopped after ${durationText}` : "Record Stop logged without a Record Start";
      const note: NoteLog = {
        id: uid("note"),
        eventType: "Record Stop",
        text,
        operatorName,
        utcIso,
        history: [
          {
            id: uid("hist"),
            action: "create",
            operatorName,
            utcIso,
            nextText: text
          }
        ]
      };
      const noteLogs = [note, ...production.noteLogs];

      return {
        ...production,
        studioDuration: recordStart ? durationText : production.studioDuration,
        noteLogs,
        rosterNames: collectRosterNames({ ...production, noteLogs })
      };
    });
  }

  function toggleRecord() {
    if (recordControlState === "recording") {
      recordStop();
      return;
    }

    logEvent("Record Start");
  }

  function renameQuickButton(id: string, label: string) {
    setQuickButtons((current) =>
      current.map((button) => (button.id === id ? { ...button, label } : button))
    );
  }

  function updateQuickButtonGroup(id: string, group: QuickButtonGroup) {
    setQuickButtons((current) =>
      current.map((button) => (button.id === id ? { ...button, group } : button))
    );
  }

  function removeQuickButton(id: string) {
    setQuickButtons((current) => current.filter((button) => button.id !== id));
  }

  function addQuickButton() {
    const label = newQuickButtonLabel.trim();
    if (!label) {
      return;
    }

    setQuickButtons((current) => [
      ...current,
      {
        id: uid("quick"),
        label,
        helper: "Custom log",
        icon: Plus,
        tone: newQuickButtonGroup === "issue" ? "red" : "teal",
        group: newQuickButtonGroup
      }
    ]);
    setNewQuickButtonLabel("");
  }

  function resetQuickButtons() {
    setQuickButtons(defaultEventButtons);
  }

  function updateField<K extends keyof Production>(field: K, value: Production[K]) {
    updateActiveProduction((production) => ({ ...production, [field]: value }));
  }

  function updateManualExportNotes(value: string) {
    updateActiveProduction((production) => ({
      ...production,
      notesForEditor: value,
      isoRecordDetails: "",
      additionalNotes: ""
    }));
  }

  function updateCrew(role: CrewRole, value: string) {
    updateActiveProduction((production) => ({
      ...production,
      crew: {
        ...production.crew,
        [role]: value
      }
    }));
  }

  function commitCrewName(role: CrewRole, value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    updateActiveProduction((production) => ({
      ...production,
      crew: {
        ...production.crew,
        [role]: trimmed
      },
      rosterNames: Array.from(new Set([...production.rosterNames, trimmed])).sort((a, b) => a.localeCompare(b))
    }));
  }

  function saveRosterFromProduction() {
    updateActiveProduction((production) => ({
      ...production,
      rosterNames: collectSavableRosterNames(production)
    }));
    setCrewSaveStatus("saved");
    window.setTimeout(() => setCrewSaveStatus("idle"), 1800);
  }

  function startEditing(note: NoteLog) {
    setEditingId(note.id);
    setEditingText(note.text);
  }

  function saveNoteEdit(noteId: string) {
    const nextText = editingText.trim();
    if (!nextText) {
      return;
    }

    updateActiveProduction((production) => ({
      ...production,
      noteLogs: production.noteLogs.map((note) => {
        if (note.id !== noteId || note.text === nextText) {
          return note;
        }

        const utcIso = nowUtcIso();
        return {
          ...note,
          text: nextText,
          history: [
            ...note.history,
            {
              id: uid("hist"),
              action: "edit",
              operatorName: operatorName || "Unknown Operator",
              utcIso,
              previousText: note.text,
              nextText
            }
          ]
        };
      })
    }));
    setEditingId("");
    setEditingText("");
  }

  function updateNoteTime(noteId: string, value: string) {
    const targetNote = activeProduction?.noteLogs.find((note) => note.id === noteId);
    if (!targetNote) {
      return;
    }

    const nextDate = timecodeToZonedDate(value, targetNote.utcIso, selectedTimeZone);
    if (!nextDate) {
      return;
    }

    const nextIso = nextDate.toISOString();
    if (nextIso === targetNote.utcIso) {
      return;
    }

    const previousTime = formatZonedDateTime(targetNote.utcIso, selectedTimeZone);
    const nextTime = formatZonedDateTime(nextIso, selectedTimeZone);
    updateActiveProduction((production) => ({
      ...production,
      noteLogs: production.noteLogs.map((note) => {
        if (note.id !== noteId) {
          return note;
        }

        const utcIso = nowUtcIso();
        return {
          ...note,
          utcIso: nextIso,
          history: [
            ...note.history,
            {
              id: uid("hist"),
              action: "edit",
              operatorName: operatorName || "Unknown Operator",
              utcIso,
              previousText: previousTime,
              nextText: nextTime
            }
          ]
        };
      })
    }));
  }

  function setNoteDeleted(noteId: string, deleted: boolean) {
    updateActiveProduction((production) => ({
      ...production,
      noteLogs: production.noteLogs.map((note) => {
        if (note.id !== noteId) {
          return note;
        }

        const utcIso = nowUtcIso();
        return {
          ...note,
          deletedAtUtc: deleted ? utcIso : undefined,
          history: [
            ...note.history,
            {
              id: uid("hist"),
              action: deleted ? "delete" : "restore",
              operatorName: operatorName || "Unknown Operator",
              utcIso
            }
          ]
        };
      })
    }));
  }

  function renderQuickButtonGroup(title: string, buttons: EventButton[]) {
    if (buttons.length === 0) {
      return null;
    }

    return (
      <div className="quick-button-group">
        <div className="quick-button-group-title">{title}</div>
        <div className="event-grid v4-event-grid">
          {buttons.map((button) => (
            <button
              key={button.id}
              className={`event-button tone-${button.tone}`}
              onClick={() => logEvent(button.label)}
              disabled={!operatorName}
            >
              <span>{button.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderQuickButtonEditor() {
    return (
      <div className="quick-editor-panel">
        <div className="quick-button-list">
          {quickButtons.map((button) => (
            <label key={button.id}>
              <input value={button.label} onChange={(event) => renameQuickButton(button.id, event.target.value)} />
              <select
                value={quickButtonGroup(button)}
                onChange={(event) => updateQuickButtonGroup(button.id, event.target.value as QuickButtonGroup)}
                aria-label={`Category for ${button.label}`}
              >
                <option value="event">Event</option>
                <option value="issue">Issue / Note</option>
              </select>
              <button type="button" onClick={() => removeQuickButton(button.id)} aria-label={`Remove ${button.label}`}>
                <Trash2 size={14} />
              </button>
            </label>
          ))}
        </div>
        <div className="join-panel v4-join-panel">
          <input
            value={newQuickButtonLabel}
            onChange={(event) => setNewQuickButtonLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                addQuickButton();
              }
            }}
            placeholder="New button name"
          />
          <select
            value={newQuickButtonGroup}
            onChange={(event) => setNewQuickButtonGroup(event.target.value as QuickButtonGroup)}
            aria-label="New button category"
          >
            <option value="event">Event</option>
            <option value="issue">Issue / Note</option>
          </select>
          <button onClick={addQuickButton}>
            <Plus size={16} />
            Add
          </button>
          <button className="secondary-button" onClick={resetQuickButtons}>
            <RotateCcw size={16} />
            Reset
          </button>
        </div>
      </div>
    );
  }

  if (!activeProduction) {
    return <div className="app-shell">No production data available.</div>;
  }

  const liveNoteCount = activeProduction.noteLogs.filter((note) => !note.deletedAtUtc).length;
  const visibleTime = formatClock(new Date(nowIso), selectedTimeZone);
  const projectedEndText = formatClock(targetSnapshot.projectedEnd, selectedTimeZone);
  const targetEndText = projectedEndText;
  const remainingText = formatRemaining(targetSnapshot.remainingMs);
  const activeDurationText = formatDuration(targetSnapshot.activeMs);
  const sessionDateText = compactDate(activeProduction.sessionDate);
  const sessionIndicatorLabel = recordControlState === "recording" ? "Recording" : targetStatus;
  const sessionIndicatorTitle = `${sessionIndicatorLabel}. ${recordControlCaption}.`;

  return (
    <div className="app-shell v4-shell">
      {copyToast ? (
        <div className="copy-toast" role="status" aria-live="polite">
          {copyToast}
        </div>
      ) : null}
      {storageWriteFailed ? (
        <div className="storage-warning" role="status" aria-label="Browser storage warning" aria-live="assertive">
          <HardDrive size={20} aria-hidden="true" />
          <span>
            <strong>Changes are not being saved</strong>
            <small>Keep this tab open and export your editor package before closing it.</small>
          </span>
          <button type="button" onClick={() => setStorageWriteFailed(false)} aria-label="Dismiss storage warning">
            <X size={18} />
          </button>
        </div>
      ) : null}
      {fullScreenClockOpen ? (
        <div className="full-screen-clock" role="dialog" aria-modal="true" aria-label="Pacific Time clock">
          <button
            className="full-screen-clock-close"
            type="button"
            onClick={() => setFullScreenClockOpen(false)}
            title="Close full-screen clock"
            aria-label="Close full-screen clock"
          >
            <X size={28} />
          </button>
          <div className="full-screen-clock-content">
            <p>Pacific Time</p>
            <CopyableValue value={visibleTime} label="current Pacific time" className="full-screen-current-time" />
            <div className="full-screen-clock-divider" />
            <span>Projected End</span>
            <CopyableValue value={projectedEndText} label="projected end" className="full-screen-projected-time" />
          </div>
        </div>
      ) : null}
      {!operatorName && (
        <div className="operator-gate" role="dialog" aria-modal="true">
          <div className="operator-panel">
            <img
              className="studio-super-wordmark studio-super-wordmark-startup"
              src={modeChoice === "light" ? studioSuperWordmarkLightSrc : studioSuperWordmarkDarkSrc}
              alt="Studio Super"
            />
            <h1>{startupMode === "choose" ? "Start Studio Super" : startupMode === "new" ? "New program" : "Open program"}</h1>
            <p>
              {startupMode === "choose"
                ? "Choose how this window should start, then pick the operator name for the note log."
                : "Pick or enter the operator name that should appear on every note."}
            </p>
            <div className="local-storage-note">
              <HardDrive size={18} />
              <span>
                Productions, saved names, quick buttons, and design choices stay in this browser on this device only.
                They are not synced, uploaded, or reachable from other devices.
              </span>
            </div>
            {startupMode === "choose" ? (
              <div className="startup-mode-grid">
                <button className="startup-choice" onClick={() => setStartupMode("new")}>
                  <Plus size={20} />
                  <span>New Program</span>
                </button>
                <button className="startup-choice" onClick={() => setStartupMode("open")}>
                  <FolderOpen size={20} />
                  <span>Open Existing</span>
                </button>
              </div>
            ) : (
              <>
                {startupMode === "new" ? (
                  <label className="startup-field">
                    Production Name
                    <input
                      autoFocus
                      value={startupProductionTitle}
                      onChange={(event) => setStartupProductionTitle(event.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                ) : (
                  <label className="startup-field">
                    Program
                    <select
                      autoFocus
                      value={startupExistingCode}
                      onChange={(event) => setStartupExistingCode(event.target.value)}
                    >
                      {summaries.map((summary) => (
                        <option key={summary.code} value={summary.code}>
                          {summary.title || summary.shortName || summary.code}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <NameAutocomplete
                  label="Operator"
                  value={operatorDraft}
                  names={savedNameOptions}
                  placeholder="Operator name"
                  onChange={setOperatorDraft}
                  onCommit={commitOperatorName}
                  commitOnBlur={false}
                  commitOnEnter={false}
                />
                <div className="operator-row">
                  <button className="secondary-button" onClick={() => setStartupMode("choose")}>
                    Back
                  </button>
                  <button
                    className="primary-button"
                    onClick={startupMode === "new" ? startNewProgram : startExistingProgram}
                    disabled={!operatorDraft.trim()}
                  >
                    <Save size={18} />
                    Start
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <header className="v4-topbar">
        <div className="v4-brand">
          <img
            className="studio-super-wordmark studio-super-wordmark-header"
            src={modeChoice === "light" ? studioSuperWordmarkLightSrc : studioSuperWordmarkDarkSrc}
            alt="Studio Super"
          />
        </div>
        <div className="v4-title-block">
          <p className="eyebrow">Production Name</p>
          <input
            className="v4-title-input"
            value={activeProduction.title}
            onChange={(event) => updateField("title", event.target.value)}
            placeholder="Production name"
          />
          <div className="header-meta">
            <span>
              <small>Short name</small>
              <CopyableValue value={activeShortName} label="short name" />
            </span>
            <span>
              <small>Date</small>
              <CopyableValue value={sessionDateText} label="session date" />
            </span>
          </div>
        </div>
        <div className="v4-tabs" role="tablist" aria-label="Dashboard sections">
          <button className={activeTab === "log" ? "active" : ""} onClick={() => setActiveTab("log")}>
            Log Mode
          </button>
          <button className={activeTab === "details" ? "active" : ""} onClick={() => setActiveTab("details")}>
            Project Details
          </button>
          <button className={activeTab === "settings" ? "active" : ""} onClick={() => setActiveTab("settings")}>
            App Settings
          </button>
          <button className={activeTab === "export" ? "active" : ""} onClick={() => setActiveTab("export")}>
            Export
          </button>
        </div>
        <div className="topbar-actions">
          {operatorName ? (
            <div
              className={`session-status-chip status-${targetTimer.status} record-${recordControlState}`}
              aria-live="polite"
              title={sessionIndicatorTitle}
            >
              <span className="session-record-dot" aria-hidden="true" />
              <span>{sessionIndicatorLabel}</span>
            </div>
          ) : null}
          <button className="app-reset-button" onClick={restartDashboard} title="Restart Studio Super">
            <RotateCcw size={16} />
            Restart
          </button>
          <div className="design-menu" ref={designMenuRef}>
            <button
              className={`design-menu-trigger ${designMenuOpen ? "active" : ""}`}
              type="button"
              onClick={() => setDesignMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={designMenuOpen}
              title="Design settings"
            >
              <Palette size={16} />
              <span>Design</span>
              <small>{activeDesignTheme.label}</small>
            </button>
            {designMenuOpen ? (
              <div className="design-menu-panel" role="menu" aria-label="Design settings">
                <div className="design-menu-head">
                  <div>
                    <span>Design</span>
                    <strong>{activeDesignTheme.label}</strong>
                  </div>
                  <button type="button" onClick={() => setDesignMenuOpen(false)}>
                    Done
                  </button>
                </div>

                <div className="design-section">
                  <span className="design-section-label">Theme</span>
                  <div className="theme-preset-grid">
                    {themeChoices.map((theme) => (
                      <button
                        key={theme.value}
                        type="button"
                        className={`theme-preset-button ${themeChoice === theme.value ? "active" : ""}`}
                        onClick={() => applyThemePreset(theme.value)}
                        role="menuitemradio"
                        aria-checked={themeChoice === theme.value}
                      >
                        <span className="theme-preset-text">
                          <strong>{theme.label}</strong>
                          <small>{theme.summary}</small>
                        </span>
                        <span className="theme-swatch-row" aria-hidden="true">
                          {theme.swatches.map((swatch) => (
                            <span key={swatch} style={{ backgroundColor: swatch }} />
                          ))}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <label className="design-select-row">
                  <span>Font</span>
                  <select value={fontChoice} onChange={(event) => setFontChoice(event.target.value as FontChoice)}>
                    {fontChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="design-section">
                  <span className="design-section-label">Mode</span>
                  <div className="design-mode-toggle">
                    {modeChoices.map((choice) => (
                      <button
                        key={choice.value}
                        type="button"
                        className={modeChoice === choice.value ? "active" : ""}
                        onClick={() => setModeChoice(choice.value)}
                        role="menuitemradio"
                        aria-checked={modeChoice === choice.value}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="design-section">
                  <span className="design-section-label">Color</span>
                  <div className="accent-choice-grid">
                    {accentChoices.map((choice) => (
                      <button
                        key={choice.value}
                        type="button"
                        className={accentChoice === choice.value ? "active" : ""}
                        onClick={() => setAccentChoice(choice.value)}
                        role="menuitemradio"
                        aria-checked={accentChoice === choice.value}
                      >
                        <span style={{ backgroundColor: choice.swatch }} aria-hidden="true" />
                        {choice.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="design-menu-note">
                  Theme, font, mode, and color choices are saved only in this browser on this device.
                </p>
              </div>
            ) : null}
          </div>
          <div className="operator-chip">
            <Users size={16} />
            <NameAutocomplete
              label="Operator"
              value={operatorDraft}
              names={savedNameOptions}
              placeholder="Operator"
              onChange={setOperatorDraft}
              onCommit={commitOperatorName}
              hideLabel
              inputAriaLabel="Operator name"
            />
          </div>
        </div>
      </header>

      <main className="dashboard v4-dashboard">
        {activeTab === "log" ? (
          <section className={`v4-page v4-log-page mobile-show-${mobilePanel}`} aria-label="Log dashboard">
            <div className="mobile-panel-switcher" aria-label="Mobile panels">
              <button className={mobilePanel === "buttons" ? "active" : ""} onClick={() => setMobilePanel("buttons")}>
                Buttons
              </button>
              <button className={mobilePanel === "timeline" ? "active" : ""} onClick={() => setMobilePanel("timeline")}>
                Timeline
              </button>
            </div>
            <div className={`v4-card target-panel timer-${targetTimer.status}`}>
              <div className="v4-card-head">
                <div>
                  <p className="panel-kicker">Current Time · Pacific</p>
                  <h2>
                    <CopyableValue value={visibleTime} label="current time" />
                  </h2>
                </div>
                <button
                  className="clock-expand-button"
                  type="button"
                  onClick={() => setFullScreenClockOpen(true)}
                  title="Open full-screen clock"
                  aria-label="Open full-screen clock"
                >
                  <Maximize2 size={20} />
                </button>
              </div>

              <div className="v4-clock-strip">
                <div className="v4-projected-end">
                  <span>Projected End</span>
                  <strong>
                    <CopyableValue value={projectedEndText} label="projected end" />
                  </strong>
                </div>
                <span className="clock-zone-label">Pacific Time</span>
              </div>

              <div className="target-controls v4-target-controls">
                <label>
                  Target Duration
                  <select value={targetTimer.targetMinutes} onChange={(event) => setTargetMinutes(Number(event.target.value))}>
                    {targetOptions.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} min
                      </option>
                    ))}
                  </select>
                </label>
                <div className="v4-button-row">
                  <button
                    className={`target-action timer-step timer-step-target ${targetTimer.status === "running" ? "pause" : "start"}`}
                    onClick={targetTimer.status === "running" ? pauseTargetTimer : startOrResumeTargetTimer}
                  >
                    <span className="timer-step-number">2</span>
                    {targetTimer.status === "running" ? <PauseCircle size={18} /> : <PlayCircle size={18} />}
                    {targetTimer.status === "running" ? "Pause Target" : targetTimer.status === "paused" ? "Resume Target" : "Start Target"}
                  </button>
                  <button className="target-reset" onClick={resetTargetTimer} title="Reset target duration">
                    <RotateCcw size={18} />
                  </button>
                </div>
              </div>

              <div className="v4-time-adders" aria-label="Add target duration">
                <button onClick={() => addTargetMinutes(1)}>+1 min</button>
              </div>

              <div className="target-stat-grid v4-stat-grid">
                <div>
                  <span>Remaining</span>
                  <strong>
                    <CopyableValue value={remainingText} label="remaining time" />
                  </strong>
                </div>
                <div>
                  <span>Active</span>
                  <strong>
                    <CopyableValue value={activeDurationText} label="active time" />
                  </strong>
                </div>
                <div>
                  <span>Target Ends</span>
                  <strong>
                    <CopyableValue value={targetEndText} label="target end time" />
                  </strong>
                </div>
              </div>
            </div>

            <div className="v4-card logging-panel">
              <div className="v4-card-head">
                <div>
                  <p className="panel-kicker">Log Entry</p>
                  <h2>Quick Log</h2>
                </div>
                <button
                  className={`record-dock timer-step-record-${recordControlState}`}
                  onClick={toggleRecord}
                  disabled={!operatorName}
                  aria-pressed={recordControlState === "recording"}
                >
                  {recordControlState === "recording" ? <Square size={20} /> : <Radio size={20} />}
                  <span>
                    <strong>{recordControlLabel}</strong>
                    <small>{recordControlCaption}</small>
                  </span>
                </button>
              </div>
              <div className="quick-button-groups">
                {renderQuickButtonGroup("Events", eventQuickButtons)}
                {renderQuickButtonGroup("Issues + Notes", issueQuickButtons)}
              </div>
            </div>

            <div className="v4-card timeline-panel">
              <div className="v4-card-head">
                <div>
                  <p className="panel-kicker">Live Note Log</p>
                  <h2>Timeline <span className="timeline-count">{liveNoteCount} live</span></h2>
                </div>
                <div className="timeline-tools">
                  <label className="search-field">
                    <Search size={14} />
                    <input value={timelineSearch} onChange={(event) => setTimelineSearch(event.target.value)} placeholder="Search" />
                  </label>
                  <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                    {noteTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="timeline-list v4-timeline-list">
                {visibleNotes.length === 0 ? (
                  <div className="empty-state">
                    <PauseCircle size={24} />
                    <strong>No matching notes yet.</strong>
                    <span>The next event button adds a timestamped entry here.</span>
                  </div>
                ) : (
                  visibleNotes.map((note) => {
                    const isEditing = editingId === note.id;
                    return (
                      <article
                        className={`note-card tone-${noteTone(note.eventType)} note-kind-${noteKind(note.eventType)} ${
                          note.deletedAtUtc ? "deleted" : ""
                        }`}
                        key={note.id}
                      >
                        <div className="note-topline">
                          <span className="event-tag">{note.eventType}</span>
                          <input
                            key={`${note.id}-${note.utcIso}-${selectedTimeZone}`}
                            className="note-timecode"
                            type="text"
                            inputMode="text"
                            defaultValue={formatEditableTimecode(new Date(note.utcIso), selectedTimeZone)}
                            onBlur={(event) => updateNoteTime(note.id, event.currentTarget.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.currentTarget.blur();
                              }
                            }}
                            title={formatZonedDateTime(note.utcIso, selectedTimeZone)}
                            aria-label={`Edit time code for ${note.eventType}`}
                          />
                        </div>
                        <textarea
                          value={isEditing ? editingText : note.text}
                          onFocus={() => startEditing(note)}
                          onChange={(event) => {
                            setEditingText(event.target.value);
                          }}
                          onInput={(event) => {
                            if (editingId !== note.id) {
                              setEditingId(note.id);
                            }
                            setEditingText(event.currentTarget.value);
                          }}
                          onBlur={() => {
                            if (editingId === note.id) {
                              saveNoteEdit(note.id);
                            }
                          }}
                          rows={2}
                        />
                        <div className="note-actions">
                          <span>{note.operatorName}</span>
                          <button onClick={() => setNoteDeleted(note.id, !note.deletedAtUtc)}>
                            {note.deletedAtUtc ? <RotateCcw size={14} /> : <Trash2 size={14} />}
                            {note.deletedAtUtc ? "Restore" : "Delete"}
                          </button>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        ) : activeTab === "details" ? (
          <section className="v4-page v4-production-page v9-details-page" aria-label="Project details dashboard">
            <div className="v4-card production-switcher">
              <div className="v4-card-head">
                <div>
                  <p className="panel-kicker">Production Rooms</p>
                  <h2>Select Production</h2>
                </div>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                  <option value="date">Date</option>
                  <option value="title">Title</option>
                  <option value="shortName">Short name</option>
                  <option value="noteCount">Notes</option>
                </select>
              </div>
              <label className="search-field">
                <Search size={14} />
                <input value={productionSearch} onChange={(event) => setProductionSearch(event.target.value)} placeholder="Search productions" />
              </label>
              <div className="production-list v4-production-list">
                {summaries.map((summary) => (
                  <div key={summary.code} className={`production-item-row ${summary.code === activeProduction.code ? "active" : ""}`}>
                    <button className="production-item" onClick={() => setActiveProductionCode(summary.code)}>
                      <span>
                        {summary.title || "Untitled Production"}
                        {summary.code === activeProduction.code ? <em>Selected</em> : null}
                      </span>
                      <small>
                        {summary.shortName || summary.code} | {compactDate(summary.sessionDate)} | {summary.noteCount} notes
                      </small>
                    </button>
                    <button
                      className="production-delete-button"
                      onClick={() => deleteProduction(summary.code)}
                      title="Delete production"
                      aria-label={`Delete ${summary.title || summary.shortName || summary.code}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="join-panel v4-join-panel">
                <input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Short name" />
                <input value={joinTitle} onChange={(event) => setJoinTitle(event.target.value)} placeholder="Title if new" />
                <button onClick={openOrCreateProduction}>
                  <Plus size={16} />
                  Open
                </button>
              </div>
            </div>

            <div className="v4-card metadata-panel">
              <div className="v4-card-head">
                <div>
                  <p className="panel-kicker">Selected Production</p>
                  <h2>{activeProduction.title || "Untitled Production"}</h2>
                </div>
                <button className="secondary-button" onClick={saveRosterFromProduction}>
                  <Save size={16} />
                  {crewSaveStatus === "saved" ? "Names Saved" : "Save Names"}
                </button>
              </div>
              <div className="selected-production-banner">
                <CheckCircle2 size={18} />
                <span>
                  <strong>Editor Package source</strong>
                  <small>{activeShortName} · {sessionDateText}</small>
                </span>
              </div>
              <div className="form-grid v4-form-grid">
                <label>
                  Production Name
                  <input value={activeProduction.title} onChange={(event) => updateField("title", event.target.value)} />
                </label>
                <label>
                  Short Name
                  <input value={activeProduction.shortName} onChange={(event) => updateField("shortName", event.target.value)} />
                </label>
                <label>
                  Session Date
                  <input type="date" value={activeProduction.sessionDate} onChange={(event) => updateField("sessionDate", event.target.value)} />
                </label>
                <label>
                  Record Duration
                  <input value={activeProduction.studioDuration} onChange={(event) => updateField("studioDuration", event.target.value)} />
                </label>
                <label className="v4-wide-field">
                  Recording Path
                  <input
                    value={activeProduction.recordingPath || defaultRecordingPath}
                    onChange={(event) => updateField("recordingPath", event.target.value)}
                  />
                </label>
                {(Object.keys(crewLabels) as CrewRole[]).map((role) => (
                  <NameAutocomplete
                    key={role}
                    label={crewLabels[role]}
                    value={activeProduction.crew[role]}
                    names={activeRoster}
                    placeholder="Operator"
                    onChange={(value) => updateCrew(role, value)}
                    onCommit={(value) => commitCrewName(role, value)}
                  />
                ))}
              </div>
            </div>

          </section>
        ) : activeTab === "settings" ? (
          <section className="v4-page app-settings-page" aria-label="App settings dashboard">
            <div className="v4-card quick-button-settings">
              <div className="v4-card-head">
                <div>
                  <p className="panel-kicker">App Settings</p>
                  <h2>Quick Log Buttons</h2>
                </div>
                <Settings size={20} />
              </div>
              {renderQuickButtonEditor()}
            </div>
            <div className="v4-card appearance-settings-card">
              <div className="v4-card-head">
                <div>
                  <p className="panel-kicker">Customization</p>
                  <h2>Appearance</h2>
                </div>
                <Palette size={20} />
              </div>
              <button className="appearance-settings-button" type="button" onClick={() => setDesignMenuOpen(true)}>
                <Palette size={20} />
                <span>
                  <strong>{activeDesignTheme.label}</strong>
                  <small>Theme · Font · Color · {modeChoice === "dark" ? "Dark" : "Light"}</small>
                </span>
              </button>
            </div>
          </section>
        ) : (
          <section className="v4-page v9-export-page" aria-label="Export dashboard">
            <div className="v4-card export-panel">
              <div className="v4-card-head">
                <div>
                  <p className="panel-kicker">Selected Production</p>
                  <h2>{activeProduction.title || "Untitled Production"}</h2>
                </div>
                <Download size={20} />
              </div>
              <div className="selected-production-banner export-selection-banner">
                <CheckCircle2 size={18} />
                <span>
                  <strong>Editor Package</strong>
                  <small>{activeShortName} · {sessionDateText} · {liveNoteCount} notes</small>
                </span>
                <button className="secondary-button" type="button" onClick={() => setActiveTab("details")}>
                  Change Production
                </button>
              </div>
              <div className="export-buttons v4-export-buttons">
                <button onClick={() => void exportPdf(activeProduction, { font: fontChoice })}>
                  <FileText size={16} />
                  PDF
                </button>
                <button onClick={() => exportCsv(activeProduction)}>
                  <FileSpreadsheet size={16} />
                  CSV
                </button>
              </div>
              <div className="local-storage-note export-storage-note">
                <HardDrive size={18} />
                <span>
                  Stored productions and names live only in this device's browser storage. Other users and devices cannot
                  access them from Studio Super; exports are the only files you create.
                </span>
              </div>
              <div className="v4-export-fields">
                <label>
                  Manual Notes for Export
                  <textarea
                    value={manualExportNotes}
                    onChange={(event) => updateManualExportNotes(event.target.value)}
                    onInput={(event) => updateManualExportNotes(event.currentTarget.value)}
                    rows={6}
                  />
                </label>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
