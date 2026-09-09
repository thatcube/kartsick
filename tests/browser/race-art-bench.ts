import { BODY_IDS, CHARACTER_IDS, DEFAULT_BUILD, getCourse, normalizeBuild } from "@kartsick/content";
import type { CourseId } from "@kartsick/content";
import { createRace, NEUTRAL } from "@kartsick/simulation";
import type { RaceEntry } from "@kartsick/simulation";
import { RaceScene } from "../../apps/web/src/render/race-scene";
import { DEFAULT_SETTINGS } from "../../apps/web/src/storage";
import { captureGraphicsFrame } from "./graphics-capture";

/** Fixed compositions through the real race renderer, including pickups and viewport fades. */
export async function createRaceArtBench() {
  const host = document.createElement("div"), canvas = document.createElement("canvas");
  host.id = "race-art-preview";
  host.style.cssText = "position:fixed;left:0;top:0;width:1600px;height:900px;z-index:2147483647;background:#17201c";
  canvas.style.cssText = "width:1600px;height:900px;display:block";
  host.append(canvas); document.body.append(host);
  let renderer: RaceScene | undefined;
  const dispose = () => {
    clearTimeout(lifetime);
    renderer?.engine.stopRenderLoop(); renderer?.dispose(); renderer = undefined; host.remove();
  };
  const lifetime = setTimeout(dispose, 180_000);
  try {
    const active = new RaceScene(canvas, { ...DEFAULT_SETTINGS, quality: "balanced", reducedMotion: true, master: 0 });
    renderer = active;
    const entries = BODY_IDS.map<RaceEntry>((body, index) => ({ id: `art-${index}`, name: `Art kart ${index + 1}`,
      build: normalizeBuild({ ...DEFAULT_BUILD, body,
        characters: [CHARACTER_IDS[index * 2 % 8], CHARACTER_IDS[(index * 2 + 1) % 8]] }),
      players: [`driver-${index}`, null] }));
    active.setRoster(entries);
    let current: { courseId: CourseId; mirror: boolean; views: 1 | 4; u: number } =
      { courseId: "butterbell", mirror: false, views: 1, u: .06 };
    let race = createRace({ courseId: current.courseId, mirror: current.mirror,
      mode: "race", speedClass: 100, bots: false, difficulty: "normal", seed: 61 }, entries);
    const draw = () => {
      if (!renderer) throw new Error("This race-art diagnostic has been disposed.");
      const course = getCourse(current.courseId, current.mirror);
      const frames = race.karts.map((kart, index) => {
        const p = course.sampleRoad(current.u - Math.floor(index / 2) * .0026);
        const lane = current.views === 1 ? 0 : index % 2 ? 1.8 : -1.8;
        Object.assign(kart.state, { x: p.x + p.dz * lane, y: p.y + .42, z: p.z - p.dx * lane,
          yaw: Math.atan2(p.dx, p.dz), roadU: p.u });
        return { id: kart.id, previous: kart.state, state: kart.state, input: NEUTRAL,
          alpha: 1, effects: {}, visible: index < current.views };
      });
      active.render(frames, course, race.pickups, [], 1 / 60, false, false, 0);
    };
    const render = (courseId: CourseId, mirror = false, views: 1 | 4 = 1, u = .06) => {
      if (!renderer) throw new Error("This race-art diagnostic has been disposed.");
      current = { courseId, mirror, views, u };
      active.loadCourse(courseId);
      race = createRace({ courseId, mirror, mode: "race", speedClass: 100, bots: false, difficulty: "normal", seed: 61 }, entries);
      active.setViews(entries.slice(0, views).map((entry, index) => ({
        id: entry.id, label: entry.name,
        viewport: views === 1 ? { x: 0, y: 0, width: 1, height: 1 } :
          { x: index % 2 * .5, y: index < 2 ? .5 : 0, width: .5, height: .5 },
      })));
      draw();
    };
    render("butterbell");
    let readiness: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([active.scene.whenReadyAsync(), new Promise<never>((_, reject) => {
        readiness = setTimeout(() => reject(new Error("Race-art graphics did not become ready within 30 seconds.")), 30_000);
      })]);
    } finally { clearTimeout(readiness); }
    active.engine.runRenderLoop(draw);
    return { dispose, render, capture: async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      draw();
      const woodland = active.scene.meshes.filter(mesh => mesh.parent?.metadata?.backgroundWoodland);
      return { image: captureGraphicsFrame(canvas,
        `Actual race renderer / ${current.courseId} / ${current.mirror ? "mirror" : "normal"} / ${current.views} views / fixed u=${current.u}`),
        evidence: { ...current, meshes: active.scene.meshes.length, materials: active.scene.materials.length,
          textures: active.scene.textures.length, vertices: active.scene.meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0),
          triangles: active.scene.meshes.reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0),
          woodlandDeterminants: woodland.map(mesh => mesh.computeWorldMatrix(true).determinant()),
          kartVisibilities: [...new Set(active.scene.transformNodes.filter(node => node.metadata?.kind === "kart")
            .flatMap(node => node.getChildMeshes().map(mesh => mesh.visibility)))],
          renderer: active.engine.getGlInfo(), pickups: race.pickups.length,
          note: "Real race-renderer integration at fixed positions; no simulated or human driving." } };
    } };
  } catch (error) { dispose(); throw error; }
}
