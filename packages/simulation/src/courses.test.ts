import { describe, expect, it } from "vitest";
import { createLayoutQuery } from "../../content-layouts/query";
import type { CourseLayout } from "../../content-layouts/types";
import { NEUTRAL, STEP, createKart, recoverKart, stepKart } from "./index";

function descent(): CourseLayout {
  return {
    id: "lastlight", name: "Progress fixture", version: "test-1", format: "sectors",
    points: [[0, 40, 0], [0, 30, 120], [0, 20, 250], [0, 10, 400], [0, 0, 600]],
    halfWidth: 6.5, shoulderWidth: 7.1, checkpoints: [0, .12, .34, .5, .69, .85, 1], sectors: [.34, .69],
    glides: [], rails: [], shortcuts: [], hazards: [], obstacles: [],
    palette: { sky: "#aabbcc", road: "#445566", verge: "#778899", rail: "#ddeeff", accent: "#aabbcc", secondary: "#445566", ground: "#778899" },
    bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 700 },
    groundHeight: () => -2, waterLevel: -3, isWater: () => false,
  };
}

describe("course-specific driving", () => {
  it("drives one complete open descent with three timed sectors, rather than three loops", () => {
    const course = createLayoutQuery(descent());
    const state = createKart(course);
    let finishes = 0;
    for (let tick = 0; tick < 60 * 80 && !state.finished; tick++) {
      finishes += stepKart(state, { ...NEUTRAL, throttle: 1 }, { course }).filter(event => event.type === "finish").length;
    }
    expect(state.finished).toBe(true);
    expect(finishes).toBe(1);
    expect(state.lap).toBe(3);
    expect(state.lapTimes).toHaveLength(3);
    expect(state.lapTimes.reduce((sum, time) => sum + time, 0)).toBeCloseTo(state.elapsed, 7);
    expect(state.z).toBeGreaterThanOrEqual(600);
    expect(state.recoveries).toBe(0);
    expect(state.elapsed).toBeGreaterThan(20);
  });

  it("recovers after the actual last gate on a nonuniform route", () => {
    const course = createLayoutQuery(descent());
    const state = createKart(course);
    state.nextCheckpoint = 5;
    recoverKart(state, course);
    const expected = course.sampleRoad(.694);
    expect(state.x).toBeCloseTo(expected.x);
    expect(state.z).toBeCloseTo(expected.z);
    expect(state.nextCheckpoint).toBe(5);
  });

  it("launches and recovers at the second flight zone instead of the first", () => {
    const course = createLayoutQuery({
      ...descent(), id: "afterglow", format: "laps", sectors: [],
      points: [[-100, 30, -100], [100, 30, -100], [100, 30, 100], [-100, 30, 100]],
      checkpoints: [0, .12, .22, .41, .62, .83], glides: [{ start: .2, end: .24 }, { start: .6, end: .64 }],
      bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
    });
    const state = createKart(course), lip = course.sampleRoad(.6 - .00001);
    Object.assign(state, { x: lip.x, y: lip.y + .42, z: lip.z, yaw: Math.atan2(lip.dx, lip.dz), vx: lip.dx * 28, vz: lip.dz * 28, speed: 28, roadU: lip.u });
    expect(stepKart(state, { ...NEUTRAL, throttle: 1 }, { course }).some(event => event.type === "launch")).toBe(true);
    expect(state.mode).toBe("glider");
    state.nextCheckpoint = 5;
    recoverKart(state, course);
    expect(state.roadU).toBeCloseTo(.525);
  });

  it("collides with the same timed hazard position the world renders", () => {
    const layout = descent(), first = createLayoutQuery(layout).sampleRoad(.12);
    layout.hazards = [{
      id: "moving-bumper", kind: "bumper", position: [first.x, first.y + .7, first.z], radius: 2, height: 1.4, strength: 9,
      motion: { axis: "x", amplitude: 8, period: 4, phase: 0 },
    }];
    const course = createLayoutQuery(layout), state = createKart(course);
    const hazard = course.hazards(1)[0];
    Object.assign(state, { x: hazard.x + 1, y: first.y + .42, z: hazard.z });
    const events = stepKart(state, NEUTRAL, { course, time: 1 });
    expect(hazard.x).toBe(8);
    expect(events.some(event => event.type === "collision")).toBe(true);
    expect(state.vx).toBeGreaterThan(8);
    expect(state.elapsed).toBe(STEP);
    expect(createLayoutQuery(layout, true).hazards(1)[0].x).toBe(-8);
  });
});
