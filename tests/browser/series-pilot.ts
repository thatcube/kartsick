import { getCourse, type CourseId } from "@kartsick/content";
import { botInput, type KartState } from "@kartsick/simulation";
import type { RaceRuntime } from "../../apps/web/src/race-runtime";
import { startFullRacePilot, stopPilot } from "./pilot";

declare global {
  interface Window {
    __KARTSICK_RACE__?: { read: () => ReturnType<RaceRuntime["snapshot"]> };
  }
}

export interface SeriesDriveEvidence {
  courseId: CourseId;
  seed: number;
  frames: number;
  ticks: number;
  elapsed: number;
  checkpoints: { gate: number; lap: number; tick: number; x: number; y: number; z: number }[];
  laps: number[];
  launches: number;
  landings: number;
  recoveries: { tick: number; count: number; gate: number }[];
  recoveryButtons: number[];
  violations: string[];
  finished: boolean;
}

let monitor = 0;
let evidence: SeriesDriveEvidence | null = null;

export function stopSeriesPilot(): SeriesDriveEvidence | null {
  cancelAnimationFrame(monitor);
  monitor = 0;
  stopPilot();
  return evidence ? structuredClone(evidence) : null;
}

// Observe the existing analog pilot; the only extra driving action is the
// ordinary mapped recovery button. Never advance or modify simulation state.
export function startSeriesPilot(budget: number, recoverButton: number): void {
  stopSeriesPilot();
  const initial = window.__KARTSICK_RACE__!.read().race;
  const local = initial.karts.find(kart => kart.players.includes("local-1"));
  if (!local || !window.__testPad || !Number.isInteger(recoverButton) || recoverButton < 0 || recoverButton >= window.__testPad.buttons.length) {
    throw new Error("The series pilot requires a local controller and its actual recovery binding.");
  }
  const course = getCourse(initial.options.courseId, initial.options.mirror);
  evidence = {
    courseId: course.id, seed: initial.options.seed, frames: 0, ticks: initial.tick, elapsed: 0,
    checkpoints: [], laps: [], launches: 0, landings: 0, recoveries: [], recoveryButtons: [], violations: [], finished: false,
  };
  let previous: KartState = local.state;
  let previousTick = initial.tick;
  let releaseRecovery = 0;
  let lastRecovery = -Infinity;
  const deadline = performance.now() + budget;

  function fail(message: string): void {
    evidence!.violations.push(message);
    stopSeriesPilot();
  }
  function observe(): void {
    const snapshot = window.__KARTSICK_RACE__!.read();
    const race = snapshot.race, kart = race.karts.find(entry => entry.id === local!.id);
    const log = evidence!;
    if (!kart || race.options.courseId !== course.id || race.options.seed !== log.seed) {
      fail("The active race changed before its controller pilot stopped.");
      return;
    }
    const state = kart.state;
    log.frames++;
    log.ticks = race.tick;
    log.elapsed = state.elapsed;
    if (kart.ai) { fail("The human kart was driven by automatic AI takeover."); return; }
    if (snapshot.mode !== "race" && snapshot.mode !== "results") { fail(`Driving unexpectedly entered ${snapshot.mode}.`); return; }
    if (race.tick < previousTick) { fail("Race ticks went backwards."); return; }
    if (![state.x, state.y, state.z, state.yaw, state.vx, state.vy, state.vz, state.speed, state.elapsed].every(Number.isFinite)) {
      fail("The physical state contains a non-finite value.");
      return;
    }
    if (state.nextCheckpoint !== previous.nextCheckpoint || state.finished && !previous.finished) {
      const finalDescentGate = course.format === "sectors" && previous.nextCheckpoint === course.checkpoints.length - 1 && state.finished;
      const expected = finalDescentGate ? previous.nextCheckpoint : (previous.nextCheckpoint + 1) % course.checkpoints.length;
      if (state.nextCheckpoint !== expected || log.checkpoints.length >= course.checkpoints.length * course.laps) {
        fail(`Checkpoint sequence skipped or repeated a gate: ${previous.nextCheckpoint} -> ${state.nextCheckpoint}.`);
        return;
      }
      log.checkpoints.push({ gate: previous.nextCheckpoint, lap: previous.lap, tick: race.tick, x: state.x, y: state.y, z: state.z });
    }
    if (state.mode === "glider" && previous.mode !== "glider") log.launches++;
    if (state.mode === "ground" && previous.mode === "glider") log.landings++;
    if (state.recoveries !== previous.recoveries) {
      log.recoveries.push({ tick: race.tick, count: state.recoveries, gate: state.nextCheckpoint });
      if (log.recoveries.length > 8) { fail("More than eight observed recoveries; not concealing a broken route."); return; }
    }
    log.laps = [...state.lapTimes];
    log.finished = state.finished;
    previous = state;
    previousTick = race.tick;
    if (race.phase === "finished") { stopSeriesPilot(); return; }
    if (performance.now() > deadline) { fail("The bounded real-time controller driving budget expired."); return; }
    const pad = window.__testPad!;
    if (releaseRecovery && race.tick >= releaseRecovery) {
      pad.buttons[recoverButton] = { value: 0, pressed: false, touched: false };
      releaseRecovery = 0;
    }
    if (!state.finished && !releaseRecovery && race.tick - lastRecovery >= 180 && botInput(race, kart).recover) {
      if (log.recoveryButtons.length >= 6) { fail("More than six controller recovery requests; not concealing a broken route."); return; }
      log.recoveryButtons.push(race.tick);
      lastRecovery = race.tick;
      releaseRecovery = race.tick + 4;
      pad.buttons[recoverButton] = { value: 1, pressed: true, touched: true };
    }
    monitor = requestAnimationFrame(observe);
  }

  startFullRacePilot(budget);
  monitor = requestAnimationFrame(observe);
}

export function readSeriesPilot(): SeriesDriveEvidence | null {
  return evidence ? structuredClone(evidence) : null;
}
