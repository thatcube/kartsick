import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { clamp, DEFAULT_BUILD, lerp } from "@kartsick/content";
import type { KartBuild } from "@kartsick/content";
import type { DriverInput, KartState } from "@kartsick/simulation";
import { Atelier } from "./geometry";
import type { Triple } from "./geometry";
import { makeCharacter } from "./characters";
import { node, RIDER_GRIPS, RIDER_MOUNT, soft, surface } from "./characters/rig";
import { makeBody } from "./parts/bodies";
import { makeWheels } from "./parts/wheels";
import { makeGlider } from "./parts/gliders";
import { makeItemVisual } from "./items";

/**
 * Authoritative visual state only; omitted fields reset to inactive.
 * Shrink scales the model root to 62% about the tire contact plane, without changing root.position.
 * Ghost fades instance meshes, never shared materials.
 * Counts are clamped to three upholstered bumpers / two separately lit coil charges.
 */
export interface KartVisualEffects {
  invincible?: boolean;
  shrunk?: boolean;
  ghost?: boolean;
  velvetBumpers?: number;
  staticCharges?: number;
}

export interface KartModel {
  root: TransformNode;
  meshes: Mesh[];
  animate(state: KartState, input: DriverInput, dt: number, reducedMotion: boolean, effects?: KartVisualEffects): void;
}

/**
 * Independently owned geometry/rigs, shared immutable Atelier materials.
 * Dispose root recursively (root.dispose()), not root.dispose(false, true).
 * Root +Z is forward; the wheel ground plane is local Y=-0.43 for every build.
 */
export function makeKart(art: Atelier, build: KartBuild = DEFAULT_BUILD): KartModel {
  if (build.characters[0] === build.characters[1]) throw new Error("A tandem kart needs two distinct characters.");
  const root = new TransformNode(`${build.body} tandem kart`, art.scene);
  root.metadata = { kind: "kart", characterIds: [...build.characters] };
  const palette = makeBody(art, root, build.body, build.paint, build.decal);
  const wheels = makeWheels(art, root, build.wheels, palette.accent);
  const steeringPivot = node(art, "inclined steering hub", root, [0, RIDER_GRIPS.front.y, RIDER_GRIPS.front.z]);
  steeringPivot.rotation.x = 0.6;
  const steeringWheel = MeshBuilder.CreateTorus("steering wheel", { diameter: RIDER_GRIPS.front.x * 2, thickness: 0.043, tessellation: 24 }, art.scene);
  art.place(steeringWheel, [0, 0, 0], art.surface("#30394f", "rubber"), steeringPivot);
  surface(art, art.tube("steering column", [[0, 0.43, 0.9], [0, 0.96, 0.75]], 0.029, "#687d87", root), "#687d87", "metal");
  for (const side of [-1, 1]) surface(art, art.tube("steering wheel spoke", [[0, 0, 0], [side * 0.22, 0, 0]],
    0.018, "#b5c6ca", steeringWheel), "#b5c6ca", "metal");
  surface(art, soft(art, steeringWheel, "steering horn boss", [0, 0.018, 0], [0.13, 0.07, 0.13], "#b5c6ca"), "#b5c6ca", "metal");
  const characters = build.characters.map(id => makeCharacter(art, id));
  for (let i = 0; i < characters.length; i++) {
    characters[i].root.parent = root;
    characters[i].root.position.set(0, RIDER_MOUNT.y, i === 0 ? RIDER_MOUNT.frontZ : RIDER_MOUNT.rearZ);
    characters[i].pose(i === 0 ? 1 : 0, 0, 0, true, 0);
  }
  const wing = makeGlider(art, root, build.glider, palette);
  const flames = [-1, 1].map(side => {
    const flame = soft(art, root, "boost flame", [side * 0.85, 0.344, -1.71], [0.16, 0.16, 0.5], "#72e5ff");
    flame.material = art.material("#72e5ff", true);
    flame.setEnabled(false);
    return flame;
  });
  const sparkMaterials = ["#fff1c8", "#ff9551", "#62e0ff"].map(color => art.material(color, true));
  const sparks = [-1, 1].map(side => {
    const spark = soft(art, root, "drift tell", [side * 1.04, -0.15, -1.35], [0.15, 0.13, 0.38], "#fff1c8");
    spark.material = sparkMaterials[0];
    spark.setEnabled(false);
    return spark;
  });
  const bumpers = Array.from({ length: 3 }, (_, i) => {
    const bumper = makeItemVisual(art, "velvet");
    bumper.name = `Velvet bumper ${i + 1}`;
    bumper.metadata = { kind: "velvet-bumper", index: i };
    bumper.parent = root;
    bumper.scaling.setAll(0.8);
    bumper.setEnabled(false);
    return bumper;
  });
  const staticRig = node(art, "Static Sling nose assembly", root, [0, 0.61, 1.22]);
  const points: Triple[] = [];
  for (let i = 0; i <= 64; i++) {
    const a = i / 64 * Math.PI * 10;
    points.push([Math.cos(a) * 0.19, Math.sin(a) * 0.19, i / 64 * 0.58]);
  }
  art.tube("oversized static nose coil", points, 0.025, "#5bd1c4", staticRig);
  soft(art, staticRig, "coil insulating foot", [0, -0.17, 0.18], [0.58, 0.12, 0.48], "#30394f", 0.6);
  const coilRim = MeshBuilder.CreateTorus("Static forward field rim", { diameter: 0.43, thickness: 0.042, tessellation: 20 }, art.scene);
  art.place(coilRim, [0, 0, 0.59], art.material("#f5f2e8"), staticRig);
  coilRim.rotation.x = Math.PI / 2;
  const charges = [-1, 1].map((side, index) => {
    const charge = soft(art, staticRig, `Static charge ${index + 1}`, [side * 0.23, 0.11, 0.16], [0.12, 0.24, 0.22], "#ffd46b");
    charge.material = art.material("#ffd46b", true);
    return charge;
  });
  staticRig.setEnabled(false);
  const halo = MeshBuilder.CreateTorus("invincibility rosette halo", { diameter: 2.92, thickness: 0.036, tessellation: 40 }, art.scene);
  art.place(halo, [0, 0.75, -0.14], art.material("#ffd46b", true), root);
  halo.setEnabled(false);

  art.batchModel(root, new Set([steeringWheel, ...flames, ...sparks, ...charges, halo]), true);
  const meshes = root.getChildMeshes().filter((mesh): mesh is Mesh => mesh instanceof Mesh);
  const visualRoots = root.getChildren().filter((child): child is TransformNode => child instanceof TransformNode);
  for (const mesh of meshes) mesh.receiveShadows = true;
  let deployed = 0;
  let effectPhase = 0;
  let shrinkOffset = 0;
  const count = (value: number | undefined, maximum: number) => Number.isFinite(value) ? clamp(Math.floor(value!), 0, maximum) : 0;
  return {
    root, meshes,
    animate(state, input, dt, reducedMotion, effects) {
      for (const child of visualRoots) child.position.y -= shrinkOffset;
      const visualDt = Number.isFinite(dt) ? clamp(dt, 0, 0.05) : 0;
      const target = state.mode === "glider" ? 1 : 0;
      deployed = reducedMotion ? target : lerp(deployed, target, Math.min(1, visualDt * 9));
      wing.setEnabled(deployed > 0.02);
      wing.scaling.setAll(Math.max(0.001, deployed));
      for (const steer of wheels.steering) steer.rotation.y = input.steer * 0.43;
      for (const roller of wheels.rollers) roller.rotation.x = (roller.rotation.x + state.speed * visualDt / wheels.radius) % (Math.PI * 2);
      steeringWheel.rotation.y = input.steer * 0.4;
      const swap = clamp(1 - state.swapTime / 0.42, 0, 1);
      const swapping = state.swapTime > 0;
      const arc = swapping ? Math.sin(swap * Math.PI) : 0;
      for (let i = 0; i < characters.length; i++) {
        const isFront = i === state.driver;
        const z = isFront ? RIDER_MOUNT.frontZ : RIDER_MOUNT.rearZ;
        const previousZ = isFront ? RIDER_MOUNT.rearZ : RIDER_MOUNT.frontZ;
        const rider = characters[i];
        const front = swapping ? lerp(isFront ? 0 : 1, isFront ? 1 : 0, swap) : Number(isFront);
        rider.root.position.set(
          arc * (i ? -0.7 : 0.7),
          RIDER_MOUNT.y + (reducedMotion ? 0 : arc * 0.15 + Math.sin(state.tick * 0.13 + i) * Math.min(Math.abs(state.speed) / 2000, 0.012)),
          swapping ? lerp(previousZ, z, swap) : z,
        );
        rider.root.rotation.z = reducedMotion ? 0 : input.steer * Math.min(Math.abs(state.speed) / 220, 0.095) * (isFront ? -0.65 : 1);
        rider.pose(front, input.steer, state.tick, reducedMotion, arc);
      }
      for (const flame of flames) {
        flame.setEnabled(state.boost > 0);
        flame.scaling.z = reducedMotion ? 0.5 : 0.5 + Math.sin(state.tick * 1.7) * 0.07;
      }
      for (const spark of sparks) {
        spark.setEnabled(state.driftDirection !== 0 && state.driftCharge > 0);
        spark.material = sparkMaterials[clamp(state.driftCharge - 1, 0, 2)];
      }
      if (!reducedMotion) effectPhase = (effectPhase + visualDt * 1.6) % (Math.PI * 2);
      const bumperCount = count(effects?.velvetBumpers, 3);
      for (let i = 0; i < bumpers.length; i++) {
        const bumper = bumpers[i], angle = i / 3 * Math.PI * 2 + (reducedMotion ? 0 : effectPhase);
        bumper.setEnabled(i < bumperCount);
        bumper.position.set(Math.sin(angle) * 1.48, 0.62, Math.cos(angle) * 1.65 - 0.1);
        bumper.rotation.y = angle;
      }
      const chargeCount = count(effects?.staticCharges, 2);
      staticRig.setEnabled(chargeCount > 0);
      for (let i = 0; i < charges.length; i++) charges[i].setEnabled(i < chargeCount);
      halo.setEnabled(Boolean(effects?.invincible));
      const scale = effects?.shrunk ? 0.62 : 1;
      root.scaling.setAll(scale);
      shrinkOffset = -0.43 * (1 / scale - 1);
      for (const child of visualRoots) child.position.y += shrinkOffset;
      const visibility = effects?.ghost ? 0.32 : 1;
      for (const mesh of meshes) mesh.visibility = visibility;
    },
  };
}
