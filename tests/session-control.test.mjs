import assert from "node:assert/strict";
import test from "node:test";
import {
  SESSION_TEMPLATES,
  computeTimerProgress,
  createSessionPlan,
  keyboardControl,
  midiControl,
  sessionPlanTotalMinutes,
  stageAtElapsed
} from "../src/session-control.mjs";

test("every production template is exact and internally consistent", () => {
  const totals = SESSION_TEMPLATES.map((template) => sessionPlanTotalMinutes(template));
  assert.deepEqual(totals, [30, 45, 60, 90]);
  for (const template of SESSION_TEMPLATES) {
    assert(template.stages.length >= 3);
    assert(template.stages.every((stage) => stage.durationMinutes > 0));
  }
});

test("template plans are cloned instead of mutating protected presets", () => {
  const first = createSessionPlan("studio-60");
  first.stages[0].label = "Changed";
  const second = createSessionPlan("studio-60");
  assert.equal(second.stages[0].label, "Setup + checks");
});

test("running timer derives elapsed time from absolute UTC without interval drift", () => {
  const timer = {
    targetMinutes: 60,
    status: "running",
    accumulatedMs: 12_345,
    lastStartedAtUtc: "2026-07-22T12:00:00.000Z"
  };
  const snapshot = computeTimerProgress(timer, "2026-07-22T12:17:03.250Z");
  assert.equal(snapshot.activeMs, 1_035_595);
  assert.equal(snapshot.remainingMs, 2_564_405);
  assert.equal(snapshot.isComplete, false);
});

test("restoring the same running timer after a crash preserves exact progress", () => {
  const persistedTimer = {
    targetMinutes: 30,
    status: "running",
    accumulatedMs: 5_000,
    lastStartedAtUtc: "2026-07-22T12:00:00.000Z"
  };
  assert.equal(computeTimerProgress(persistedTimer, "2026-07-22T12:10:00.000Z").activeMs, 605_000);
  assert.equal(computeTimerProgress({ ...persistedTimer }, "2026-07-22T12:10:00.000Z").activeMs, 605_000);
});

test("paused timers never accrue hidden active time", () => {
  const timer = {
    targetMinutes: 30,
    status: "paused",
    accumulatedMs: 420_000,
    pauseStartedAtUtc: "2026-07-22T12:07:00.000Z"
  };
  const snapshot = computeTimerProgress(timer, "2026-07-22T12:27:00.000Z");
  assert.equal(snapshot.activeMs, 420_000);
  assert.equal(snapshot.pausedMs, 1_200_000);
});

test("stage lookup is deterministic at every boundary", () => {
  const plan = createSessionPlan("interview-30");
  assert.equal(stageAtElapsed(plan, 0)?.id, "preflight");
  assert.equal(stageAtElapsed(plan, 5 * 60_000)?.id, "interview");
  assert.equal(stageAtElapsed(plan, 25 * 60_000)?.id, "wrap");
  assert.equal(stageAtElapsed(plan, 45 * 60_000)?.id, "wrap");
});

test("keyboard controls reject modifiers and map operator shortcuts", () => {
  assert.deepEqual(keyboardControl(" "), { type: "toggle-timer" });
  assert.deepEqual(keyboardControl("R"), { type: "toggle-record" });
  assert.deepEqual(keyboardControl("7"), { type: "quick-button", index: 6 });
  assert.equal(keyboardControl("R", { ctrlKey: true }), null);
});

test("MIDI controls accept note-on only and map the studio surface", () => {
  assert.deepEqual(midiControl(Uint8Array.from([0x90, 36, 100])), { type: "toggle-record" });
  assert.deepEqual(midiControl(Uint8Array.from([0x90, 41, 127])), { type: "toggle-timer" });
  assert.equal(midiControl(Uint8Array.from([0x90, 36, 0])), null);
  assert.equal(midiControl(Uint8Array.from([0x80, 36, 100])), null);
});

