import { test, expect } from "./fixture";
import { writeFile } from "node:fs/promises";
import { CHARACTER_IDS, ITEM_IDS, type CourseId } from "@kartsick/content";
import type { createGraphicsBench } from "./graphics-bench";
import type { createItemGraphicsBench } from "./item-graphics-bench";
import type { createRaceArtBench } from "./race-art-bench";

declare global {
  interface Window {
    __graphicsBench?: Awaited<ReturnType<typeof createGraphicsBench>>;
    __itemGraphicsBench?: Awaited<ReturnType<typeof createItemGraphicsBench>>;
    __raceArtBench?: Awaited<ReturnType<typeof createRaceArtBench>>;
  }
}

const source = "/@fs" + new URL("./graphics-bench.ts", import.meta.url).pathname;
const courses: { id: CourseId; quality: "balanced" | "high"; views: readonly (readonly [string, number, boolean])[] }[] = [
  ...(["balanced", "high"] as const).map(quality => ({ id: "butterbell" as const, quality, views: [
    ["start", .018, false], ["barn-approach", .115, false], ["barn-bend", .18, false], ["windmill-approach", .40, false],
    ["starting-arch", .99, false], ["kart-detail", .018, true],
  ] as const })),
  { id: "afterglow", quality: "balanced", views: [["departures", .035, false], ["climb", .155, false], ["arrivals", .49, false], ["return", .715, false]] },
  { id: "escaluna", quality: "balanced", views: [["atrium", .028, false], ["gallery", .165, false], ["promenade", .755, false]] },
  { id: "tiltglass", quality: "balanced", views: [["table", .035, false], ["cushions", .14, false], ["crown", .39, false], ["return", .74, false]] },
  { id: "copperwhistle", quality: "balanced", views: [["boardwalk", .035, false], ["canopy", .18, false], ["bough", .47, false], ["return", .84, false]] },
  { id: "lastlight", quality: "balanced", views: [["alpine", .04, false], ["ridge", .28, false], ["valley", .56, false], ["lakeside", .88, false]] },
];

for (const { id, quality, views } of courses) test(`${id} ${quality} graphics uses repeatable driving-view compositions`, async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/__network-test");
  const errors: string[] = [];
  const failure = new Promise<never>((_, reject) => {
    const recordError = (message: string) => { errors.push(message); reject(new Error(message)); };
    page.on("pageerror", error => recordError(error.message));
    page.on("console", message => { if (message.type() === "error") recordError(message.text()); });
  });
  const capture = page.evaluate(async ({ source, quality, id }) => {
    const { createGraphicsBench }: typeof import("./graphics-bench") = await import(source);
    window.__graphicsBench = await createGraphicsBench(id, quality);
    return window.__graphicsBench.evidence;
  }, { source, quality, id });
  try {
    const evidence = await Promise.race([capture, failure]);
    const compositions = [];
    for (const [name, u, detail] of views) {
      const composition = await page.evaluate(({ u, detail, name }) => {
        const bench = window.__graphicsBench;
        if (!bench) throw new Error("The graphics composition was not initialized.");
        return bench.render(u, detail, name);
      }, { u, detail, name });
      expect(Object.values(composition).every(Number.isFinite)).toBe(true);
      if (!detail) {
        expect(composition.width).toBeGreaterThan(.15);
        expect(composition.width).toBeLessThan(.2);
        expect(composition.height).toBeGreaterThan(.28);
        expect(composition.height).toBeLessThan(.36);
      }
      compositions.push({ name, ...composition });
      await page.waitForTimeout(300);
      await page.screenshot({ path: info.outputPath(`${id}-${name}.png`) });
    }
    expect(errors).toEqual([]);
    await writeFile(info.outputPath("graphics-evidence.json"), JSON.stringify({ ...evidence, compositions }, null, 2));
  } finally {
    await page.evaluate(() => { window.__graphicsBench?.dispose(); delete window.__graphicsBench; });
  }
});

test.describe("cast and item art", () => {
  test("all approved pairs have front and driving-camera art views without rebuilding their models", async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/__network-test");
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    try {
      await page.evaluate(async source => {
        const { createGraphicsBench }: typeof import("./graphics-bench") = await import(source);
        window.__graphicsBench = await createGraphicsBench("butterbell", "balanced");
      }, source);
      let baseline: number[] | undefined;
      for (const focus of [0, 2, 4, 6]) for (const detail of [false, true]) {
        const name = `${CHARACTER_IDS[focus]}-${CHARACTER_IDS[focus + 1]}-${detail ? "front" : "driving"}`;
        const capture = await page.evaluate(async ({ focus, detail, name }) => {
          const bench = window.__graphicsBench!;
          bench.render(.018, detail, name, focus);
          return bench.capture();
        }, { focus, detail, name });
        expect(capture.evidence.characters).toEqual(CHARACTER_IDS.slice(focus, focus + 2));
        expect(Object.values(capture.evidence.composition).every(Number.isFinite)).toBe(true);
        const { meshes, materials, textures, vertices } = capture.evidence;
        const resources = [meshes, materials, textures, vertices];
        if (baseline) expect(resources).toEqual(baseline);
        else baseline = resources;
        await writeFile(info.outputPath(`${name}.png`), Buffer.from(capture.image.split(",")[1], "base64"));
        await writeFile(info.outputPath(`${name}.json`), JSON.stringify(capture.evidence, null, 2));
      }
      expect(errors).toEqual([]);
    } finally {
      await page.evaluate(() => { window.__graphicsBench?.dispose(); delete window.__graphicsBench; });
    }
  });

  test("the complete item catalog and both delivery pickups retain one bounded model set", async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/__network-test");
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    try {
      await page.evaluate(async source => {
        const { createItemGraphicsBench }: typeof import("./item-graphics-bench") = await import(source);
        window.__itemGraphicsBench = await createItemGraphicsBench();
      }, "/@fs" + new URL("./item-graphics-bench.ts", import.meta.url).pathname);
      let baseline: number[] | undefined;
      const catalogGroups = Math.ceil(ITEM_IDS.length / 4);
      for (let group = 0; group < catalogGroups + 2; group++) {
        const ids = ITEM_IDS.slice(group * 4, group * 4 + 4);
        const capture = await page.evaluate(async ({ ids, group, catalogGroups }) => {
          const bench = window.__itemGraphicsBench!;
          if (ids.length) bench.render(ids);
          else bench.renderPickup(group === catalogGroups + 1);
          return bench.capture();
        }, { ids, group, catalogGroups });
        const { meshes, materials, textures, vertices } = capture.evidence;
        const resources = [meshes, materials, textures, vertices];
        if (baseline) expect(resources).toEqual(baseline);
        else baseline = resources;
        await writeFile(info.outputPath(`items-${group}.png`), Buffer.from(capture.image.split(",")[1], "base64"));
        await writeFile(info.outputPath(`items-${group}.json`), JSON.stringify(capture.evidence, null, 2));
      }
      expect(errors).toEqual([]);
    } finally {
      await page.evaluate(() => { window.__itemGraphicsBench?.dispose(); delete window.__itemGraphicsBench; });
    }
  });

  test("race art stays bounded and restores rider visibility across mirrored and split-screen views", async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/__network-test");
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    try {
      await page.evaluate(async source => {
        const { createRaceArtBench }: typeof import("./race-art-bench") = await import(source);
        window.__raceArtBench = await createRaceArtBench();
      }, "/@fs" + new URL("./race-art-bench.ts", import.meta.url).pathname);
      let baseline: number[] | undefined;
      const configurations = [[false, 1], [true, 4], [false, 1]] as const;
      for (const [index, [mirror, views]] of configurations.entries()) {
        await page.evaluate(({ mirror, views }) => window.__raceArtBench!.render("butterbell", mirror, views), { mirror, views });
        await page.waitForTimeout(600);
        const capture = await page.evaluate(() => window.__raceArtBench!.capture());
        expect(capture.evidence.pickups).toBe(12);
        expect(capture.evidence.kartVisibilities).toEqual([1]);
        expect(capture.evidence.woodlandDeterminants).toHaveLength(8);
        for (const determinant of capture.evidence.woodlandDeterminants) expect(determinant).toBeCloseTo(mirror ? -1 : 1);
        const { meshes, materials, textures, vertices } = capture.evidence;
        const resources = [meshes, materials, textures, vertices];
        if (index === 0) baseline = resources;
        if (index === 2) expect(resources).toEqual(baseline);
        await writeFile(info.outputPath(`race-art-${index}.png`), Buffer.from(capture.image.split(",")[1], "base64"));
        await writeFile(info.outputPath(`race-art-${index}.json`), JSON.stringify(capture.evidence, null, 2));
      }
      expect(errors).toEqual([]);
    } finally {
      await page.evaluate(() => { window.__raceArtBench?.dispose(); delete window.__raceArtBench; });
    }
  });
});
