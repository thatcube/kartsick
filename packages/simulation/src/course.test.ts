import { expect, it } from "vitest";
import { GAP_END, angleDifference, clamp, sampleRoad } from "@kartsick/content";
import { NEUTRAL, STEP, createKart, stepKart } from "./index";

it("the manual physics can complete the whole study, including each flight crossing", () => {
  const state = createKart();
  let launches = 0;
  let landings = 0;
  for (let tick = 0; tick < 60 * 180 && !state.finished; tick++) {
    const airborne = state.mode === "glider";
    const target = sampleRoad(airborne ? Math.max(state.roadU + 0.025, GAP_END + 0.008) : state.roadU + 0.025);
    const heading = Math.atan2(target.x - state.x, target.z - state.z);
    const error = angleDifference(heading, state.yaw);
    const near = sampleRoad(state.roadU);
    const ahead = sampleRoad(state.roadU + 0.03);
    const turn = Math.abs(angleDifference(Math.atan2(ahead.dx, ahead.dz), Math.atan2(near.dx, near.dz)));
    const desiredSpeed = turn > 0.6 ? 14 : turn > 0.32 ? 19 : 26;
    const events = stepKart(state, {
      ...NEUTRAL,
      throttle: state.speed < desiredSpeed ? 1 : 0,
      brake: state.speed > desiredSpeed + 2 ? 0.25 : 0,
      steer: clamp(error * 2.5, -1, 1),
    });
    launches += events.filter(event => event.type === "launch").length;
    landings += events.filter(event => event.type === "land").length;
  }
  const evidence = { lap: state.lap, nextCheckpoint: state.nextCheckpoint, u: state.roadU, launches, landings, recoveries: state.recoveries, elapsed: state.tick * STEP };
  expect(state.finished, JSON.stringify(evidence)).toBe(true);
  expect(launches).toBe(3);
  expect(landings).toBeGreaterThanOrEqual(3);
  expect(state.recoveries).toBe(0);
});
