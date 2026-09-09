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

for (const quality of ["balanced", "high"] as const) test(`Butterbell ${quality} graphics uses repeatable driving-view compositions`, async ({ page }, info) => {
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
  const capture = page.evaluate(async ({ root, quality }) => {
    const [{ createStage, focusSun }, { makeKart }, { ChaseCamera, updateKartPose }, content, simulation, { DEFAULT_SETTINGS },
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
    const settings: typeof DEFAULT_SETTINGS = { ...DEFAULT_SETTINGS, quality, reducedMotion: true, master: 0 };
    const stage = createStage(canvas, settings);
    const worldResources = { meshes: stage.scene.meshes.length, materials: stage.scene.materials.length,
      textures: stage.scene.textures.length, vertices: stage.scene.meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0),
      triangles: stage.scene.meshes.reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0) };
    if (!stage.world.environment?.fog ||
      stage.scene.fogColor.toHexString().toLowerCase() !== stage.world.environment.fog.toLowerCase()) {
      throw new Error("Butterbell must retain its authored environment through the game's course loader.");
    }
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
      focusSun(stage, states[0]);
      stage.world.animate(0, true);
      stage.scene.render();
      return measureKartComposition(models[0].meshes, stage.camera, stage.engine.getRenderWidth(), stage.engine.getRenderHeight());
    };
    let pose = .018, detailView = false;
    const bench = { render: (u: number, detail = false) => {
      pose = u; detailView = detail;
      return render(u, detail);
    }, dispose: () => { stage.engine.stopRenderLoop(); stage.scene.dispose(); stage.engine.dispose(); },
      count: () => ({ meshes: stage.scene.meshes.length, materials: stage.scene.materials.length,
        textures: stage.scene.textures.length, vertices: stage.scene.meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0) }) };
    Object.assign(window, { __graphicsBench: bench });
    render(.018);
    await stage.scene.whenReadyAsync();
    // Use the real engine frame lifecycle: a single scene.render can capture a stale postprocess frame.
    stage.engine.runRenderLoop(() => render(pose, detailView));
    render(.018);
    return { ...bench.count(), worldResources, quality, courseVersion: course.version, renderer: stage.engine.getGlInfo(),
      lighting: { fog: stage.scene.fogColor.asArray(), sun: stage.light.intensity, fill: stage.fill.intensity,
        direction: stage.light.direction.asArray(), exposure: stage.scene.imageProcessingConfiguration.exposure },
      composition: render(.018), note: "Fixed renderer-only compositions, not a driven race or a performance certification." };
  }, { root: source, quality });
  try {
    const evidence = await Promise.race([capture, failure]);
    const compositions = [];
    for (const [name, u, detail] of [
      ["start", .018, false], ["barn-approach", .115, false], ["orchard", .18, false], ["reservoir", .40, false],
      ["starting-arch", .99, false], ["kart-detail", .018, true],
    ] as const) {
      const composition = await page.evaluate(({ u, detail, name, quality }) => {
        const bench = window.__graphicsBench;
        if (!bench) throw new Error("The graphics composition was not initialized.");
        let caption = document.getElementById("graphics-caption");
        if (!caption) {
          caption = document.createElement("div");
          caption.id = "graphics-caption";
          caption.style.cssText = "position:fixed;bottom:8px;left:8px;padding:5px 8px;background:#17201ccc;color:#fff;font:12px monospace;pointer-events:none";
          document.body.append(caption);
        }
        caption.textContent = `Butterbell / ${quality} / ${name} / u=${u}`;
        return bench.render(u, detail);
      }, { u, detail, name, quality });
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
