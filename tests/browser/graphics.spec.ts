import { test, expect } from "./fixture";
import { writeFile } from "node:fs/promises";
import type { CourseId } from "@kartsick/content";
import type { createGraphicsBench } from "./graphics-bench";

declare global {
  interface Window {
    __graphicsBench?: Awaited<ReturnType<typeof createGraphicsBench>>;
  }
}

const source = "/@fs" + new URL("./graphics-bench.ts", import.meta.url).pathname;
const courses: { id: CourseId; quality: "balanced" | "high"; views: readonly (readonly [string, number, boolean])[] }[] = [
  ...(["balanced", "high"] as const).map(quality => ({ id: "butterbell" as const, quality, views: [
    ["start", .018, false], ["barn-approach", .115, false], ["orchard", .18, false], ["reservoir", .40, false],
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
