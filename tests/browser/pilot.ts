import { GAP_END, angleDifference, clamp, sampleRoad } from "@kartsick/content";
import type { KartState } from "@kartsick/simulation";

let frame = 0;

export function stopPilot(): void {
  cancelAnimationFrame(frame);
  const pad = window.__testPad;
  if (!pad) return;
  pad.axes.fill(0);
  for (const button of pad.buttons) {
    button.value = 0;
    button.pressed = false;
    button.touched = false;
  }
}

function startPilot(update: (state: KartState, pad: NonNullable<Window["__testPad"]>) => void): void {
  stopPilot();
  if (!window.__testPad) throw new Error("The test pilot requires its own synthetic gamepad.");
  const deadline = performance.now() + 110_000;
  function step(): void {
    const state = window.__KARTSICK_DIAGNOSTICS__!.read().state;
    if (performance.now() > deadline || state.lap > 1 || state.recoveries > 0) {
      stopPilot();
      return;
    }
    update(state, window.__testPad!);
    frame = requestAnimationFrame(step);
  }
  frame = requestAnimationFrame(step);
}

export function startCoursePilot(): void {
  startPilot((state, pad) => {
    const flying = state.mode === "glider";
    const target = sampleRoad(flying ? Math.max(state.roadU + 0.025, GAP_END + 0.008) : state.roadU + 0.025);
    const error = angleDifference(Math.atan2(target.x - state.x, target.z - state.z), state.yaw);
    const near = sampleRoad(state.roadU);
    const ahead = sampleRoad(state.roadU + 0.03);
    const turn = Math.abs(angleDifference(Math.atan2(ahead.dx, ahead.dz), Math.atan2(near.dx, near.dz)));
    const desiredSpeed = turn > 0.6 ? 14 : turn > 0.32 ? 19 : 26;
    const steer = clamp(error * 2.5, -1, 1);
    pad.axes[0] = steer === 0 ? 0 : steer * 0.86 + Math.sign(steer) * 0.14;
    pad.buttons[7].value = state.speed < desiredSpeed ? 1 : 0;
    pad.buttons[6].value = state.speed > desiredSpeed + 2 ? 0.25 : 0;
    pad.buttons[7].pressed = pad.buttons[7].value > 0.5;
    pad.buttons[6].pressed = pad.buttons[6].value > 0.5;
  });
}

export function startDriftPilot(): void {
  let startedAt: number | null = null;
  startPilot((state, pad) => {
    if (state.speed > 18 && startedAt === null) startedAt = state.tick;
    pad.buttons[7].value = startedAt === null ? 1 : 0.3;
    pad.buttons[5].value = startedAt === null ? 0 : 1;
    if (startedAt !== null) {
      const phase = Math.floor((state.tick - startedAt) / 9);
      pad.axes[0] = phase % 2 === 0 && state.driftCharge < 3 ? 0.4 : -1;
    }
  });
}
