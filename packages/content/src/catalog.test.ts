import { describe, expect, it } from "vitest";
import {
  BODIES, BODY_IDS, CHARACTER_IDS, CHARACTERS, CUPS, DECALS, DECAL_IDS, DEFAULT_BUILD,
  GLIDERS, GLIDER_IDS, ITEMS, ITEM_IDS, PAINTS, PAINT_IDS, WHEELS, WHEEL_IDS,
  availableSeries, combinedStats, getCourse, normalizeBuild, validBuild,
} from "./index";

describe("approved complete metadata", () => {
  it.each([
    [CHARACTERS, CHARACTER_IDS], [BODIES, BODY_IDS], [WHEELS, WHEEL_IDS], [GLIDERS, GLIDER_IDS],
    [PAINTS, PAINT_IDS], [DECALS, DECAL_IDS], [ITEMS, ITEM_IDS],
  ])("contains each stable ID once", (catalog, ids) => {
    expect(catalog.map(v => v.id)).toEqual(ids);
    expect(new Set(catalog.map(v => v.id)).size).toBe(ids.length);
  });
  it("rejects duplicate people and invalid values instead of silently changing a build", () => {
    expect(validBuild(DEFAULT_BUILD)).toBe(true);
    expect(normalizeBuild({})).toEqual(DEFAULT_BUILD);
    for (const edit of [{ characters: ["clutch", "clutch"] }, { body: "mystery" }, { wheels: null }, { glider: "paper" }, { paint: "red" }, { decal: "logo" }]) {
      expect(validBuild({ ...DEFAULT_BUILD, ...edit })).toBe(false);
      expect(() => normalizeBuild(edit)).toThrow();
    }
  });
  it("keeps character appearances and cosmetics out of every handling stat", () => {
    const basic = combinedStats(DEFAULT_BUILD);
    expect(combinedStats(normalizeBuild({ characters: ["bollo", "pompa"], paint: "pool", decal: "checks" }))).toEqual(basic);
    for (const body of BODY_IDS) for (const wheels of WHEEL_IDS) for (const glider of GLIDER_IDS) {
      const stats = combinedStats(normalizeBuild({ body, wheels, glider }));
      expect(Object.values(stats).every(n => n >= .6 && n <= 1.7)).toBe(true);
    }
    expect(BODIES.every(p => Object.values(p.stats).some(n => n < 1) && Object.values(p.stats).some(n => n > 1))).toBe(true);
  });
  it("supports approved course identities without inventing unreviewed track layouts or cups", () => {
    for (const cup of CUPS) expect(availableSeries(cup.courses)).toBe(false);
    expect(() => getCourse("lastlight")).toThrow(/checkpoint/);
    expect(availableSeries(["butterbell"])).toBe(true);
  });
  it("reflects geometry, queries, normals, collision shapes and lateral signs together", () => {
    const a = getCourse(), b = getCourse("butterbell", true);
    for (const u of [.01, .3, .55, .67, .9]) {
      const p = a.sampleRoad(u), q = b.sampleRoad(u);
      expect(q.x).toBe(-p.x); expect(q.dx).toBe(-p.dx); expect(q.z).toBe(p.z);
      expect(b.projectRoad(-p.x - 2, p.z).lateral).toBeCloseTo(-a.projectRoad(p.x + 2, p.z).lateral);
      expect(b.surfaceHeight(-p.x - 2, p.z)).toBe(a.surfaceHeight(p.x + 2, p.z));
    }
    expect(b.colliders.map(c => c.x)).toEqual(a.colliders.map(c => -c.x));
  });
});
