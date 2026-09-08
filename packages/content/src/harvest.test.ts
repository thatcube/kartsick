import { expect, it } from "vitest";
import { butterbellHazards, getCourse, sampleRoad, terrainHeight } from "./index";

it("shares visible rolling harvest motion with mirrored collision positions", () => {
  for (const time of [0, 1.3, 3.5, 7]) {
    const canonical = butterbellHazards(time);
    expect(getCourse().hazards(time)).toEqual(canonical);
    expect(getCourse("butterbell", true).hazards(time)).toEqual(canonical.map(h => ({ ...h, x: -h.x })));
    canonical.forEach((hazard, index) => {
      const p = sampleRoad(index ? .865 : .18);
      expect(Math.hypot(hazard.x - p.x, hazard.z - p.z) - hazard.radius).toBeGreaterThan(2.4);
    });
  }
  expect(butterbellHazards(0)[0].x).not.toBe(butterbellHazards(1.3)[0].x);
  expect(terrainHeight(-118, 68)).toBeGreaterThan(20);
  expect(terrainHeight(214, 106)).toBeGreaterThan(18);
});
