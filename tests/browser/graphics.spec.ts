import { test, expect } from "./fixture";
import { writeFile } from "node:fs/promises";
import type { measureKartComposition } from "./graphics-composition";

declare global {
  interface Window {
    __graphicsBench?: {
      render(u: number, detail?: boolean): ReturnType<typeof measureKartComposition>;
      dispose(): void;
    };
  }
}

const source = "/@fs" + new URL("../../", import.meta.url).pathname;
type GraphicsModules = [
  typeof import("../../apps/web/src/render/stage"),
  typeof import("../../apps/web/src/render/kart"),
  typeof import("../../apps/web/src/render/driving-pose"),
  typeof import("@kartsick/content"),
  typeof import("@kartsick/simulation"),
  typeof import("../../apps/web/src/storage"),
  typeof import("./graphics-composition"),
  typeof import("../../apps/web/src/render/contact-shadow"),
];

test("Butterbell graphics uses repeatable driving-view compositions", async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/__network-test");
  const errors: string[] = [];
  const failure = new Promise<never>((_, reject) => {
    const recordError = (message: string) => {
      errors.push(message);
      reject(new Error(message));
    };
    page.on("pageerror", error => recordError(error.message));
    page.on("console", message => { if (message.type() === "error") recordError(message.text()); });
  });
  const capture = page.evaluate(async root => {
    const [{ createStage }, { makeKart }, { ChaseCamera, updateKartPose }, content, simulation, { DEFAULT_SETTINGS },
      { measureKartComposition }, { makeContactShadow, makeContactShadowMaterial, updateContactShadow }]: GraphicsModules = await Promise.all([
      import(root + "apps/web/src/render/stage.ts"),
      import(root + "apps/web/src/render/kart.ts"),
      import(root + "apps/web/src/render/driving-pose.ts"),
      import(root + "packages/content/src/index.ts"),
      import(root + "packages/simulation/src/index.ts"),
      import(root + "apps/web/src/storage.ts"),
      import(root + "tests/browser/graphics-composition.ts"),
      import(root + "apps/web/src/render/contact-shadow.ts"),
    ]);
    document.body.style.cssText = "margin:0;overflow:hidden";
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100vw;height:100vh;display:block";
    document.body.append(canvas);
    const settings: typeof DEFAULT_SETTINGS = { ...DEFAULT_SETTINGS, quality: "high", reducedMotion: true, master: 0 };
    const stage = createStage(canvas, settings);
    const course = content.getCourse("butterbell");
    const chase = new ChaseCamera(stage.camera);
    stage.scene.activeCamera = stage.camera;
    const models = Array.from({ length: 8 }, (_, index) => {
      const build = content.normalizeBuild({ ...content.DEFAULT_BUILD,
        characters: [content.CHARACTER_IDS[index], content.CHARACTER_IDS[(index + 1) % 8]],
        body: content.BODY_IDS[index],
      });
      const model = makeKart(stage.art, build);
      for (const mesh of model.meshes) {
        stage.shadows.addShadowCaster(mesh);
        mesh.receiveShadows = true;
      }
      return model;
    });
    const contactMaterial = makeContactShadowMaterial(stage.scene);
    const contacts = models.map(() => makeContactShadow(stage.scene, contactMaterial));
    const states = models.map(() => simulation.createKart(course));
    const render = (u: number, detail = false) => {
      for (let i = 0; i < models.length; i++) {
        const road = course.sampleRoad(u + (i ? .011 + Math.floor((i - 1) / 2) * .012 : 0));
        const lateral = i ? (i % 2 ? -1 : 1) * 1.8 : 0;
        Object.assign(states[i], { x: road.x + road.dz * lateral, y: road.y + .42,
          z: road.z - road.dx * lateral, yaw: Math.atan2(road.dx, road.dz), roadU: road.u });
        updateKartPose(models[i], states[i], states[i], simulation.NEUTRAL, 1, 1 / 60,
          false, settings, course.surfaceHeight, false);
        updateContactShadow(contacts[i], course, models[i].root);
      }
      chase.started = false;
      chase.update(models[0].root.position, states[0].yaw, states[0], 1 / 60, false, 0, settings, course.surfaceHeight);
      if (detail) {
        const state = states[0], forwardX = Math.sin(state.yaw), forwardZ = Math.cos(state.yaw);
        stage.camera.position.set(state.x + forwardX * 4.5 - forwardZ * 3.5, state.y + 2,
          state.z + forwardZ * 4.5 + forwardX * 3.5);
        const target = models[0].root.position.clone();
        target.y += .85;
        stage.camera.setTarget(target);
      }
      stage.light.position.set(states[0].x + 47, states[0].y + 83, states[0].z - 30);
      stage.world.animate(0, true);
      stage.scene.render();
      return measureKartComposition(models[0].meshes, stage.camera, stage.engine.getRenderWidth(), stage.engine.getRenderHeight());
    };
    const bench = { render, dispose: () => { stage.scene.dispose(); stage.engine.dispose(); },
      count: () => ({ meshes: stage.scene.meshes.length, materials: stage.scene.materials.length,
        textures: stage.scene.textures.length, vertices: stage.scene.meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0) }) };
    Object.assign(window, { __graphicsBench: bench });
    render(.018);
    await stage.scene.whenReadyAsync();
    render(.018);
    return { ...bench.count(), courseVersion: course.version, renderer: stage.engine.getGlInfo(),
      composition: render(.018), note: "Fixed renderer-only compositions, not a driven race or a performance certification." };
  }, source);
  try {
    const evidence = await Promise.race([capture, failure]);
    const compositions = [];
    for (const [name, u, detail] of [
      ["start", .018, false], ["orchard", .18, false], ["reservoir", .40, false],
      ["starting-arch", .99, false], ["kart-detail", .018, true],
    ] as const) {
      const composition = await page.evaluate(({ u, detail }) => {
        const bench = window.__graphicsBench;
        if (!bench) throw new Error("The graphics composition was not initialized.");
        return bench.render(u, detail);
      }, { u, detail });
      expect(Object.values(composition).every(Number.isFinite)).toBe(true);
      if (!detail) {
        expect(composition.width).toBeGreaterThan(.15);
        expect(composition.width).toBeLessThan(.2);
        expect(composition.height).toBeGreaterThan(.28);
        expect(composition.height).toBeLessThan(.36);
      }
      compositions.push({ name, ...composition });
      await page.waitForTimeout(300);
      await page.screenshot({ path: info.outputPath(`butterbell-${name}.png`) });
    }
    expect(errors).toEqual([]);
    await writeFile(info.outputPath("graphics-evidence.json"), JSON.stringify({ ...evidence, compositions }, null, 2));
  } finally {
    await page.evaluate(() => window.__graphicsBench?.dispose());
  }
});
