import type { SessionPlan, TargetTimer } from "./types";

export interface SessionTemplate extends SessionPlan {
  id: string;
  label: string;
  description: string;
}

export type StudioControl =
  | { type: "toggle-timer" }
  | { type: "toggle-record" }
  | { type: "fullscreen-clock" }
  | { type: "cycle-display" }
  | { type: "log-event"; label: string }
  | { type: "quick-button"; index: number };

export const SESSION_TEMPLATES: readonly SessionTemplate[];
export function sessionPlanTotalMinutes(plan: SessionPlan | null | undefined): number;
export function createSessionPlan(templateId: string): SessionPlan;
export function computeTimerProgress(timer: TargetTimer, nowInput: string | number): {
  targetMs: number;
  activeMs: number;
  pausedMs: number;
  remainingMs: number;
  isComplete: boolean;
};
export function stageAtElapsed(plan: SessionPlan | null | undefined, elapsedMs: number):
  | (SessionPlan["stages"][number] & {
      index: number;
      startMinutes: number;
      endMinutes: number;
      elapsedMs: number;
      remainingMs: number;
    })
  | null;
export function keyboardControl(
  key: string,
  modifiers?: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }
): StudioControl | null;
export function midiControl(data: ArrayLike<number>): StudioControl | null;

