import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { getCourse } from "@kartsick/content";
import { AFTERGLOW } from "../../../../packages/content-layouts/afterglow";
import { createLayoutQuery } from "../../../../packages/content-layouts/query";
import { contactShadowHeight, makeContactShadow, updateContactShadow } from "./contact-shadow";

it.each([false, true])("keeps contact shadows on the occupied deck, including a lower shortcut (mirror %s)", mirror => {
  const course = createLayoutQuery(AFTERGLOW, mirror);
  const main = createLayoutQuery({ ...AFTERGLOW, shortcuts: [] }, mirror);
  const point = course.routes[1].points.find(point => {
    const upper = main.projectRoad(point.x, point.z);
    return upper.separation < upper.shoulderWidth && upper.y > point.y + 2;
  });
  expect(point).toBeDefined();
  if (!point) throw new Error("The airport fixture has no overlapping decks.");
  const upper = main.projectRoad(point.x, point.z);
  expect(contactShadowHeight(course, { ...point, y: upper.y + .42 })).toBeCloseTo(upper.y + .075);
  expect(contactShadowHeight(course, { ...point, y: point.y + .42 })).toBeCloseTo(point.y + .075);
});

it.each([false, true])("keeps the shadow above painted pavement and tangent to slopes (mirror %s)", mirror => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const course = getCourse("butterbell", mirror);
    const anchor = new TransformNode("kart anchor", scene);
    const shadow = makeContactShadow(scene, new StandardMaterial("contact", scene));
    for (const u of [.04, .19, .23, .36, .84]) {
      const road = course.sampleRoad(u);
      anchor.position.set(road.x, road.y + .42, road.z);
      anchor.rotation.y = Math.atan2(road.dx, road.dz);
      updateContactShadow(shadow, course, anchor);
      const matrix = shadow.computeWorldMatrix(true);
      const vertices = shadow.getVerticesData(VertexBuffer.PositionKind)!;
      for (let index = 0; index < vertices.length; index += 3) {
        const point = Vector3.TransformCoordinates(Vector3.FromArray(vertices, index), matrix);
        const ground = course.surfaceHeight(point.x, point.z);
        expect(point.y - ground).toBeGreaterThan(.025);
        expect(point.y - ground).toBeLessThan(.18);
      }
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
