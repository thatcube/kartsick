import { createStage, focusSun, loadStageCourse } from "../../apps/web/src/render/stage";
import { makeKart } from "../../apps/web/src/render/kart";
import { ChaseCamera, updateKartPose } from "../../apps/web/src/render/driving-pose";
import { makeContactShadow, makeContactShadowMaterial, updateContactShadow } from "../../apps/web/src/render/contact-shadow";
import { DEFAULT_SETTINGS } from "../../apps/web/src/storage";
import { BODY_IDS, CHARACTER_IDS, DEFAULT_BUILD, getCourse, normalizeBuild } from "@kartsick/content";
import type { CourseId } from "@kartsick/content";
import { createKart, NEUTRAL } from "@kartsick/simulation";
import { measureKartComposition } from "./graphics-composition";

/** The same bounded, renderer-only diagnostic works in Playwright and the shared preview browser. */
export async function createGraphicsBench(id: CourseId, quality: "balanced" | "high") {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0;width:1600px;height:900px;z-index:2147483647;background:#17201c";
  host.id = "graphics-preview";
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:1600px;height:900px;display:block";
  const caption = document.createElement("div");
  caption.style.cssText = "position:absolute;bottom:8px;left:8px;padding:5px 8px;background:#17201ccc;color:#fff;font:12px monospace;pointer-events:none";
  host.append(canvas, caption);
  document.body.append(host);
  const settings = { ...DEFAULT_SETTINGS, quality, reducedMotion: true, master: 0 };
  let stage: ReturnType<typeof createStage> | undefined;
  const dispose = () => { clearTimeout(lifetime); stage?.engine.stopRenderLoop(); stage?.scene.dispose(); stage?.engine.dispose(); host.remove(); stage = undefined; };
  const lifetime = setTimeout(dispose, 180_000);
  try {
    const active = createStage(canvas, settings);
    stage = active;
    loadStageCourse(active, id);
    const count = () => ({ meshes: active.scene.meshes.length, materials: active.scene.materials.length,
      textures: active.scene.textures.length, vertices: active.scene.meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0),
      triangles: active.scene.meshes.reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0) });
    const worldResources = count();
    if (id === "butterbell" && (!active.world.environment?.fog ||
      active.scene.fogColor.toHexString().toLowerCase() !== active.world.environment.fog.toLowerCase())) {
      throw new Error("Butterbell must retain its authored environment through the game's course loader.");
    }
    const course = getCourse(id), chase = new ChaseCamera(active.camera);
    active.scene.activeCamera = active.camera;
    const models = Array.from({ length: 8 }, (_, index) => {
      const build = normalizeBuild({ ...DEFAULT_BUILD,
        characters: [CHARACTER_IDS[index], CHARACTER_IDS[(index + 1) % 8]], body: BODY_IDS[index] });
      const model = makeKart(active.art, build);
      for (const mesh of model.meshes) { active.shadows.addShadowCaster(mesh); mesh.receiveShadows = true; }
      return model;
    });
    const material = makeContactShadowMaterial(active.scene);
    const contacts = models.map(() => makeContactShadow(active.scene, material));
    const states = models.map(() => createKart(course));
    let pose = .018, detailView = false;
    const render = (u: number, detail = false) => {
      if (!stage) throw new Error("This graphics diagnostic has been disposed.");
      for (let i = 0; i < models.length; i++) {
        const road = course.sampleRoad(u + (i ? .011 + Math.floor((i - 1) / 2) * .012 : 0));
        const lateral = i ? (i % 2 ? -1 : 1) * 1.8 : 0;
        Object.assign(states[i], { x: road.x + road.dz * lateral, y: road.y + .42,
          z: road.z - road.dx * lateral, yaw: Math.atan2(road.dx, road.dz), roadU: road.u });
        updateKartPose(models[i], states[i], states[i], NEUTRAL, 1, 1 / 60, false, settings, course.surfaceHeight, false);
        updateContactShadow(contacts[i], course, models[i].root);
      }
      chase.started = false;
      chase.update(models[0].root.position, states[0].yaw, states[0], 1 / 60, false, 0, settings, course.surfaceHeight);
      if (detail) {
        const state = states[0], fx = Math.sin(state.yaw), fz = Math.cos(state.yaw);
        active.camera.position.set(state.x + fx * 4.5 - fz * 3.5, state.y + 2, state.z + fz * 4.5 + fx * 3.5);
        const target = models[0].root.position.clone();
        target.y += .85;
        active.camera.setTarget(target);
      }
      focusSun(active, states[0]);
      active.world.animate(0, true);
      active.scene.render();
      return measureKartComposition(models[0].meshes, active.camera, active.engine.getRenderWidth(), active.engine.getRenderHeight());
    };
    render(pose);
    let readyTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([active.scene.whenReadyAsync(), new Promise<never>((_, reject) => {
        readyTimeout = setTimeout(() => reject(new Error("The graphics scene did not become ready within 30 seconds.")), 30_000);
      })]);
    } finally { clearTimeout(readyTimeout); }
    active.engine.runRenderLoop(() => render(pose, detailView));
    const evidence = { ...count(), worldResources, quality, courseVersion: course.version, renderer: active.engine.getGlInfo(),
      groundcover: active.scene.metadata?.groundcover,
      lighting: { fog: active.scene.fogColor.asArray(), sun: active.light.intensity, fill: active.fill.intensity,
        direction: active.light.direction.asArray(), exposure: active.scene.imageProcessingConfiguration.exposure },
      note: "Fixed renderer-only compositions, not a driven race or a performance certification." };
    return { evidence, dispose, render: (u: number, detail = false, name = "driving view") => {
      pose = u; detailView = detail;
      caption.textContent = `${id} / ${quality} / ${name} / u=${u}`;
      return render(u, detail);
    } };
  } catch (error) {
    dispose();
    throw error;
  }
}
