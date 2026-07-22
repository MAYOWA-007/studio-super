export const SESSION_TEMPLATES = Object.freeze([
  {
    id: "interview-30",
    label: "Focused Interview",
    description: "Fast preflight, interview, and clean handoff.",
    stages: [
      { id: "preflight", label: "Preflight", durationMinutes: 5, cue: "ready" },
      { id: "interview", label: "Interview", durationMinutes: 20, cue: "stage" },
      { id: "wrap", label: "Wrap + handoff", durationMinutes: 5, cue: "wrap" }
    ]
  },
  {
    id: "live-45",
    label: "45-Minute Live",
    description: "A precise live-show rundown with protected open and close.",
    stages: [
      { id: "line-check", label: "Line check", durationMinutes: 5, cue: "ready" },
      { id: "open", label: "Open", durationMinutes: 5, cue: "stage" },
      { id: "program", label: "Program", durationMinutes: 30, cue: "stage" },
      { id: "close", label: "Close", durationMinutes: 5, cue: "wrap" }
    ]
  },
  {
    id: "studio-60",
    label: "60-Minute Studio",
    description: "Balanced setup, two record blocks, pickup time, and wrap.",
    stages: [
      { id: "setup", label: "Setup + checks", durationMinutes: 8, cue: "ready" },
      { id: "block-a", label: "Record block A", durationMinutes: 20, cue: "stage" },
      { id: "block-b", label: "Record block B", durationMinutes: 20, cue: "stage" },
      { id: "pickups", label: "Pickups", durationMinutes: 8, cue: "warning" },
      { id: "wrap", label: "Wrap", durationMinutes: 4, cue: "wrap" }
    ]
  },
  {
    id: "production-90",
    label: "90-Minute Production",
    description: "Long-form session with planned reset and pickup windows.",
    stages: [
      { id: "preflight", label: "Preflight", durationMinutes: 10, cue: "ready" },
      { id: "block-a", label: "Record block A", durationMinutes: 30, cue: "stage" },
      { id: "reset", label: "Reset", durationMinutes: 10, cue: "warning" },
      { id: "block-b", label: "Record block B", durationMinutes: 30, cue: "stage" },
      { id: "pickups-wrap", label: "Pickups + wrap", durationMinutes: 10, cue: "wrap" }
    ]
  }
]);

export function sessionPlanTotalMinutes(plan) {
  if (!plan || !Array.isArray(plan.stages)) return 0;
  return plan.stages.reduce((total, stage) => total + Math.max(0, Number(stage.durationMinutes) || 0), 0);
}

export function createSessionPlan(templateId) {
  const template = SESSION_TEMPLATES.find((candidate) => candidate.id === templateId) || SESSION_TEMPLATES[2];
  return {
    templateId: template.id,
    stages: template.stages.map((stage) => ({ ...stage }))
  };
}

export function computeTimerProgress(timer, nowInput) {
  const nowMs = typeof nowInput === "number" ? nowInput : new Date(nowInput).getTime();
  const targetMs = Math.max(1, Number(timer?.targetMinutes) || 1) * 60_000;
  const lastStartedMs = timer?.lastStartedAtUtc ? new Date(timer.lastStartedAtUtc).getTime() : Number.NaN;
  const runningMs = timer?.status === "running" && Number.isFinite(lastStartedMs)
    ? Math.max(0, nowMs - lastStartedMs)
    : 0;
  const activeMs = Math.max(0, Number(timer?.accumulatedMs) || 0) + runningMs;
  const pauseStartedMs = timer?.pauseStartedAtUtc ? new Date(timer.pauseStartedAtUtc).getTime() : Number.NaN;
  const pausedMs = timer?.status === "paused" && Number.isFinite(pauseStartedMs)
    ? Math.max(0, nowMs - pauseStartedMs)
    : 0;

  return {
    targetMs,
    activeMs,
    pausedMs,
    remainingMs: targetMs - activeMs,
    isComplete: activeMs >= targetMs
  };
}

export function stageAtElapsed(plan, elapsedMs) {
  if (!plan || !Array.isArray(plan.stages) || plan.stages.length === 0) return null;
  const elapsedMinutes = Math.max(0, Number(elapsedMs) || 0) / 60_000;
  let stageStartMinutes = 0;

  for (let index = 0; index < plan.stages.length; index += 1) {
    const stage = plan.stages[index];
    const stageEndMinutes = stageStartMinutes + Math.max(0, Number(stage.durationMinutes) || 0);
    if (elapsedMinutes < stageEndMinutes || index === plan.stages.length - 1) {
      return {
        ...stage,
        index,
        startMinutes: stageStartMinutes,
        endMinutes: stageEndMinutes,
        elapsedMs: Math.max(0, elapsedMs - stageStartMinutes * 60_000),
        remainingMs: Math.max(0, stageEndMinutes * 60_000 - elapsedMs)
      };
    }
    stageStartMinutes = stageEndMinutes;
  }

  return null;
}

export function keyboardControl(key, modifiers = {}) {
  if (modifiers.altKey || modifiers.ctrlKey || modifiers.metaKey) return null;
  const normalized = String(key || "").toLowerCase();
  if (normalized === " " || normalized === "spacebar") return { type: "toggle-timer" };
  if (normalized === "r") return { type: "toggle-record" };
  if (normalized === "f") return { type: "fullscreen-clock" };
  if (normalized === "m") return { type: "log-event", label: "Marker" };
  if (normalized === "d") return { type: "cycle-display" };
  if (/^[1-9]$/.test(normalized)) return { type: "quick-button", index: Number(normalized) - 1 };
  return null;
}

export function midiControl(data) {
  const bytes = Array.from(data || []);
  if (bytes.length < 2) return null;
  const status = bytes[0] & 0xf0;
  const note = bytes[1];
  const velocity = bytes[2] ?? 127;
  if (status !== 0x90 || velocity === 0) return null;

  const map = new Map([
    [36, { type: "toggle-record" }],
    [37, { type: "log-event", label: "Segment Start" }],
    [38, { type: "log-event", label: "Segment End" }],
    [39, { type: "log-event", label: "Good Take" }],
    [40, { type: "log-event", label: "Audio Issue" }],
    [41, { type: "toggle-timer" }],
    [42, { type: "log-event", label: "Marker" }]
  ]);
  return map.get(note) || null;
}

