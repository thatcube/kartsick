import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { CourseQuery } from "@kartsick/content";

export function contactShadowHeight(course: CourseQuery, position: { x: number; y: number; z: number }): number {
  const { x, y, z } = position;
  const road = course.projectRoad(x, z, y + .8);
  return (road.y <= y + .8 ? course.surfaceHeight(x, z, road) : course.terrainHeight(x, z)) + .02;
}

export function makeContactShadow(scene: Scene, material: StandardMaterial, name = "soft kart contact"): Mesh {
  const contact = MeshBuilder.CreateDisc(name, { radius: 1, tessellation: 24 }, scene);
  contact.rotation.x = Math.PI / 2;
  contact.material = material;
  contact.isPickable = false;
  return contact;
}

export function updateContactShadow(contact: Mesh, course: CourseQuery, anchor: TransformNode): void {
  contact.position.set(anchor.position.x, contactShadowHeight(course, anchor.position), anchor.position.z);
  contact.rotation.y = anchor.rotation.y;
  contact.scaling.set(1.15 * anchor.scaling.x, 1.6 * anchor.scaling.z, 1);
}

export function makeContactShadowMaterial(scene: Scene): StandardMaterial {
  const texture = new DynamicTexture("original soft contact", { width: 128, height: 128 }, scene, false);
  const context = texture.getContext();
  const gradient = context.createRadialGradient(64, 64, 9, 64, 64, 64);
  gradient.addColorStop(0, "rgba(0,0,0,.85)");
  gradient.addColorStop(.4, "rgba(0,0,0,.58)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.clearRect(0, 0, 128, 128);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  texture.hasAlpha = true;
  texture.update();
  const material = new StandardMaterial("shared soft kart contact", scene);
  material.diffuseTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  material.disableLighting = true;
  material.emissiveColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.alpha = .42;
  material.backFaceCulling = false;
  return material;
}
