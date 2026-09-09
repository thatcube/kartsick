import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ITEM_IDS, ITEMS, getCourse } from "@kartsick/content";
import type { ItemId } from "@kartsick/content";
import { createStage, focusSun } from "../../apps/web/src/render/stage";
import { makeItemVisual, makePickupBox } from "../../apps/web/src/render/items";
import { DEFAULT_SETTINGS } from "../../apps/web/src/storage";
import { captureGraphicsFrame } from "./graphics-capture";

/** Native catalog/detail views at unchanged model scale; this does not drive a race. */
export async function createItemGraphicsBench() {
  const host = document.createElement("div"), canvas = document.createElement("canvas");
  host.id = "item-graphics-preview";
  host.style.cssText = "position:fixed;left:0;top:0;width:1600px;height:900px;z-index:2147483647;background:#17201c";
  canvas.style.cssText = "width:1600px;height:900px;display:block";
  host.append(canvas); document.body.append(host);
  let stage: ReturnType<typeof createStage> | undefined;
  const dispose = () => {
    clearTimeout(lifetime);
    stage?.engine.stopRenderLoop(); stage?.scene.dispose(); stage?.engine.dispose();
    stage = undefined; host.remove();
  };
  const lifetime = setTimeout(dispose, 180_000);
  try {
    const active = createStage(canvas, { ...DEFAULT_SETTINGS, quality: "balanced", reducedMotion: true, master: 0 });
    stage = active;
    const models = new Map(ITEM_IDS.map(id => [id, makeItemVisual(active.art, id)]));
    const cases = [makePickupBox(active.art), makePickupBox(active.art)];
    const point = getCourse().sampleRoad(.14), yaw = Math.atan2(point.dx, point.dz);
    active.scene.activeCamera = active.camera;
    let labels: { text: string; point: Vector3 }[] = [], shown = "items";
    const hide = () => {
      for (const model of [...models.values(), ...cases]) model.setEnabled(false);
      labels = [];
    };
    const camera = (distance: number) => {
      active.camera.position.set(point.x + point.dx * distance - point.dz * 1.3,
        point.y + distance * .31, point.z + point.dz * distance + point.dx * 1.3);
      active.camera.setTarget(new Vector3(point.x, point.y + .85, point.z));
      focusSun(active, point);
    };
    const render = (ids: readonly ItemId[]) => {
      if (!stage) throw new Error("This item diagnostic has been disposed.");
      if (!ids.length || ids.length > 4 || new Set(ids).size !== ids.length ||
        ids.some(id => !models.has(id))) throw new RangeError("Choose one to four distinct catalog items.");
      hide(); camera(ids.length === 1 ? 4 : 11);
      shown = ids.join(", ");
      for (const [index, id] of ids.entries()) {
        const model = models.get(id)!;
        const lateral = (index - (ids.length - 1) / 2) * 3.2;
        model.position.set(point.x + point.dz * lateral, point.y + 1, point.z - point.dx * lateral);
        model.rotation.y = yaw; model.setEnabled(true);
        const definition = ITEMS.find(item => item.id === id);
        if (!definition) throw new Error(`Missing item catalog entry: ${id}.`);
        labels.push({ text: definition.name, point: model.position.add(new Vector3(0, -.75, 0)) });
      }
      active.scene.render();
    };
    const renderPickup = (double = false) => {
      if (!stage) throw new Error("This item diagnostic has been disposed.");
      hide(); camera(double ? 5 : 3.6); shown = double ? "Double delivery pickup" : "Delivery pickup";
      for (const [index, model] of cases.entries()) {
        model.setEnabled(double || index === 0);
        const offset = double ? (index ? .83 : -.83) : 0;
        model.position.set(point.x + Math.cos(yaw + .35) * offset, point.y + 1, point.z - Math.sin(yaw + .35) * offset);
        model.scaling.setAll(double ? .95 : 1); model.rotation.y = yaw + .35;
      }
      active.scene.render();
    };
    render(["slip", "bounce", "homing", "leader"]);
    let readiness: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([active.scene.whenReadyAsync(), new Promise<never>((_, reject) => {
        readiness = setTimeout(() => reject(new Error("Item graphics did not become ready within 30 seconds.")), 30_000);
      })]);
    } finally { clearTimeout(readiness); }
    active.engine.runRenderLoop(() => active.scene.render());
    const counts = () => ({ meshes: active.scene.meshes.length, materials: active.scene.materials.length,
      textures: active.scene.textures.length, vertices: active.scene.meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0),
      triangles: active.scene.meshes.reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0) });
    return { dispose, render, renderPickup, capture: async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (!stage) throw new Error("This item diagnostic has been disposed.");
      active.scene.render();
      const viewport = active.camera.viewport.toGlobal(1600, 900);
      const projected = labels.map(label => {
        const p = Vector3.Project(label.point, Matrix.Identity(), active.scene.getTransformMatrix(), viewport);
        return { text: label.text, x: p.x, y: p.y + 35 };
      });
      return { image: captureGraphicsFrame(canvas, `Original Kartsick item art / Balanced / ${shown}`, projected),
        evidence: { ...counts(), shown, renderer: active.engine.getGlInfo(),
          note: "Unscaled catalog models and pickup close-ups, not a driven race or performance certification." } };
    } };
  } catch (error) { dispose(); throw error; }
}
