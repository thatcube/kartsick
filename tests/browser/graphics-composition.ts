import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

export function measureKartComposition(meshes: readonly Mesh[], camera: Camera, width: number, height: number) {
  const viewport = camera.viewport.toGlobal(width, height);
  const points = meshes.filter(mesh => mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0).flatMap(mesh => {
    mesh.computeWorldMatrix(true);
    return mesh.getBoundingInfo().boundingBox.vectorsWorld.map(point =>
      Vector3.Project(point, Matrix.IdentityReadOnly, camera.getTransformationMatrix(), viewport));
  });
  if (!points.length) throw new Error("The composition has no visible kart.");
  const left = Math.min(...points.map(p => p.x)), right = Math.max(...points.map(p => p.x));
  const top = Math.min(...points.map(p => p.y)), bottom = Math.max(...points.map(p => p.y));
  return { width: (right - left) / width, height: (bottom - top) / height, top: top / height, bottom: bottom / height };
}
