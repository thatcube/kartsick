import { describe, expect, it } from "vitest";
import {
  GAP_START, ORCHARD, SCENERY_COLLIDERS, SHOULDER_WIDTH, WATER_LEVEL,
  bankHeight, bankWidth, projectRoad, sampleRoad, surfaceHeight, terrainHeight,
} from "./index";

describe("shared visible and physical course surfaces", () => {
  it("joins the raised ridge to pasture continuously at both bank edges", () => {
    const road = sampleRoad(0.55);
    for (const side of [-1, 1]) {
      const at = (width: number) => ({
        x: road.x + road.dz * side * width,
        z: road.z - road.dx * side * width,
      });
      const inner = at(SHOULDER_WIDTH);
      const outerWidth = SHOULDER_WIDTH + bankWidth(road);
      const outer = at(outerWidth);
      expect(bankHeight(road, inner.x, inner.z, SHOULDER_WIDTH)).toBeCloseTo(road.y);
      expect(bankHeight(road, outer.x, outer.z, outerWidth)).toBeCloseTo(terrainHeight(outer.x, outer.z));
      const edge = at(SHOULDER_WIDTH + 0.01);
      expect(Math.abs(bankHeight(road, edge.x, edge.z, SHOULDER_WIDTH + 0.01) - road.y)).toBeLessThan(0.01);
    }
  });

  it("does not invent an invisible road over the water crossing", () => {
    const gap = sampleRoad(GAP_START + 0.055);
    expect(surfaceHeight(gap.x, gap.z)).toBeCloseTo(terrainHeight(gap.x, gap.z));
    expect(terrainHeight(77, -14)).toBeLessThan(WATER_LEVEL);
  });

  it("keeps orchard trunks clear of the road and gives each one a collision shape", () => {
    expect(ORCHARD.length).toBeGreaterThan(40);
    for (const tree of ORCHARD) {
      expect(projectRoad(tree.x, tree.z).separation).toBeGreaterThanOrEqual(14);
      expect(SCENERY_COLLIDERS.some(collider => collider.name === "orchard trunk" && collider.x === tree.x && collider.z === tree.z)).toBe(true);
    }
  });
});
