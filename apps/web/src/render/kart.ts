import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { clamp, lerp } from "@kartsick/content";
import type { DriverInput, KartState } from "@kartsick/simulation";
import { Atelier } from "./geometry";

const INK = "#30394f";
const MINT = "#63cab9";
const CREAM = "#fff0cf";
const ORANGE = "#ef7949";
const PLUM = "#694665";

interface RiderModel {
  root: TransformNode;
  pose(front: number): void;
}

function riderArms(art: Atelier, root: TransformNode, sleeve: string, handColor: string, broad: boolean): RiderModel {
  const up = Vector3.Up();
  const arms = [-1, 1].map(side => {
    const arm = new TransformNode("articulated sleeve", art.scene);
    arm.parent = root;
    arm.position.set(side * (broad ? 0.35 : 0.29), 0.84, 0.03);
    arm.rotationQuaternion = Quaternion.Identity();
    art.cylinder("sleeve", [0, 0.26, 0], broad ? 0.25 : 0.18, broad ? 0.31 : 0.23, 0.52, sleeve, arm);
    art.oval("cuff", [0, 0.52, 0], broad ? [0.29, 0.09, 0.28] : [0.22, 0.07, 0.2], sleeve, arm);
    const hand = new TransformNode("gripping hand", art.scene);
    hand.parent = root;
    art.oval("hand", [0, 0, 0], broad ? [0.28, 0.25, 0.27] : [0.2, 0.22, 0.21], handColor, hand, 0.75);
    return { side, arm, hand, direction: new Vector3() };
  });
  return {
    root,
    pose(front) {
      for (const { side, arm, hand, direction } of arms) {
        hand.position.set(side * lerp(0.55, 0.255, front), lerp(0.4, 0.51, front), lerp(-0.2, 0.5, front));
        hand.position.subtractToRef(arm.position, direction);
        arm.scaling.y = direction.length() / 0.6;
        direction.normalize();
        Quaternion.FromUnitVectorsToRef(up, direction, arm.rotationQuaternion!);
      }
    },
  };
}

function clutch(art: Atelier): RiderModel {
  const root = new TransformNode("Clutch", art.scene);
  art.oval("coverall", [0, 0.62, 0], [0.77, 0.86, 0.58], ORANGE, root, 0.76);
  art.oval("Clutch head", [0, 1.28, 0.02], [0.78, 0.61, 0.62], "#eeb790", root, 0.67);
  art.oval("hair", [0, 1.52, -0.055], [0.8, 0.23, 0.63], PLUM, root, 0.65);
  art.oval("nose", [0, 1.24, 0.35], [0.25, 0.17, 0.2], "#f2c49a", root, 0.65);
  for (const side of [-1, 1]) {
    art.oval("rail boot", [side * 0.25, 0.15, 0.25], [0.4, 0.25, 0.68], INK, root, 0.55);
    art.oval("ear", [side * 0.41, 1.28, 0], [0.2, 0.26, 0.19], "#eeb790", root);
    art.box("goggle rim", [side * 0.2, 1.62, 0.25], [0.34, 0.23, 0.1], MINT, root).rotation.z = side * -0.08;
    art.box("goggle lens", [side * 0.2, 1.62, 0.308], [0.23, 0.13, 0.035], "#d9faf1", root);
    art.oval("eye white", [side * 0.17, 1.35, 0.323], [0.16, 0.18, 0.055], CREAM, root);
    art.oval("eye", [side * 0.16, 1.35, 0.352], [0.066, 0.11, 0.023], INK, root);
    art.tube("raised eyebrow", [[side * 0.1, 1.49, 0.32], [side * 0.18, 1.5, 0.32], [side * 0.26, 1.46, 0.29]], 0.025, PLUM, root);
    art.tube("wide mustache", [
      [0, 1.14, 0.37], [side * 0.16, 1.18, 0.39], [side * 0.35, 1.1, 0.35],
      [side * 0.54, 1.13, 0.28], [side * 0.62, 1.26, 0.22],
    ], 0.075, PLUM, root);
  }
  art.tube("zip", [[0, 0.35, 0.293], [0, 0.91, 0.293]], 0.019, INK, root);
  art.box("workshop badge", [-0.18, 0.82, 0.294], [0.17, 0.065, 0.03], "#ffd46b", root).rotation.z = 0.2;
  return riderArms(art, root, ORANGE, CREAM, true);
}

function bramble(art: Atelier): RiderModel {
  const root = new TransformNode("Bramble", art.scene);
  art.oval("quilted tunic", [0, 0.65, 0], [0.61, 0.71, 0.42], "#80986c", root, 0.73);
  art.oval("Bramble head", [0, 1.28, 0], [0.57, 0.65, 0.49], "#efc499", root, 0.7);
  art.oval("plum hair", [0, 1.54, -0.055], [0.64, 0.25, 0.55], PLUM, root, 0.6);
  for (const side of [-1, 1]) {
    art.oval("legging", [side * 0.15, 0.29, 0], [0.18, 0.44, 0.21], INK, root);
    art.oval("trail boot", [side * 0.17, 0.1, 0.13], [0.27, 0.24, 0.48], "#997155", root, 0.65);
    const ear = art.mesh("leaf ear", [
      side * 0.22, 1.36, 0, side * 0.58, 1.55, -0.02, side * 0.4, 1.15, 0,
      side * 0.34, 1.33, 0.12,
    ], [0, 1, 3, 1, 2, 3, 2, 0, 3, 2, 1, 0]);
    ear.material = art.material("#efc499");
    ear.parent = root;
    art.oval("Bramble eye white", [side * 0.125, 1.32, 0.251], [0.13, 0.16, 0.04], CREAM, root);
    art.oval("Bramble eye", [side * 0.12, 1.32, 0.273], [0.047, 0.1, 0.02], INK, root);
    const eyebrow = art.box("leaf eyebrow", [side * 0.19, 1.41, 0.247], [0.26, 0.045, 0.035], "#697f54", root);
    eyebrow.rotation.z = side * 0.14;
  }
  for (let i = 0; i < 3; i++) {
    const tuft = art.oval("hair tuft", [-0.19 + i * 0.18, 1.66 + i * 0.024, -0.01], [0.25, 0.3, 0.32], PLUM, root, 0.5);
    tuft.rotation.z = -0.3;
  }
  art.oval("scarf collar", [0, 0.99, 0.01], [0.65, 0.2, 0.52], "#d66f45", root, 0.75);
  art.box("scarf end", [0.2, 0.77, 0.258], [0.18, 0.44, 0.045], "#d66f45", root).rotation.z = -0.3;
  const compass = art.cylinder("compass", [0, 0.62, 0.238], 0.2, 0.2, 0.04, "#f5cd75", root);
  compass.rotation.x = Math.PI / 2;
  art.box("compass needle", [0, 0.62, 0.267], [0.025, 0.1, 0.02], "#3445a8", root).rotation.z = -0.45;
  const cape = art.box("folded map cape", [0, 0.64, -0.27], [0.64, 0.63, 0.045], "#f4ebcf", root);
  cape.rotation.x = -0.14;
  art.tube("map path", [[-0.2, 0.85, -0.35], [-0.1, 0.7, -0.35], [0.1, 0.75, -0.35], [0.2, 0.43, -0.35]], 0.013, "#bca36f", root);
  return riderArms(art, root, "#80986c", "#efc499", false);
}

export interface KartModel {
  root: TransformNode;
  meshes: Mesh[];
  animate(state: KartState, input: DriverInput, dt: number, reducedMotion: boolean): void;
}

export function makeKart(art: Atelier): KartModel {
  const root = new TransformNode("Boiler Bug tandem kart", art.scene);
  art.loft("enamel hull", [
    [-1.62, 0.1, 0.36, 0.1], [-1.35, 0.79, 0.35, 0.23],
    [-0.7, 0.84, 0.36, 0.25], [0.2, 0.8, 0.37, 0.3],
    [0.9, 0.61, 0.29, 0.24], [1.35, 0.39, 0.2, 0.19], [1.53, 0.04, 0.19, 0.03],
  ], ORANGE, root);
  art.oval("lower chassis", [0, 0.14, -0.15], [1.65, 0.28, 2.6], INK, root, 0.5);
  art.oval("rear standing deck", [0, 0.62, -1.06], [1.54, 0.14, 0.85], "#f9e8be", root, 0.42);
  art.oval("seat cushion", [0, 0.61, 0.27], [0.82, 0.18, 0.76], "#657c91", root, 0.55);
  art.oval("seat back", [0, 0.84, -0.06], [0.88, 0.59, 0.19], "#657c91", root, 0.55);
  art.tube("bumper", [[-0.82, 0.19, 0.97], [-0.54, 0.23, 1.62], [0.54, 0.23, 1.62], [0.82, 0.19, 0.97]], 0.075, "#e4d8b9", root);
  art.tube("rear handrail", [[-0.75, 0.57, -1.49], [-0.75, 1, -1.49], [0.75, 1, -1.49], [0.75, 0.57, -1.49]], 0.046, MINT, root);
  for (const side of [-1, 1]) {
    art.tube("rear side grip", [[side * 0.55, 0.65, -1.35], [side * 0.55, 1.02, -1.35], [side * 0.55, 1.02, -0.85]], 0.045, MINT, root);
  }
  const steering: TransformNode[] = [];
  const rollers: TransformNode[] = [];
  for (const side of [-1, 1]) {
    for (const front of [true, false]) {
      const pivot = new TransformNode("wheel steering", art.scene);
      pivot.parent = root;
      pivot.position.set(side * 0.99, 0, front ? 0.95 : -1.13);
      if (front) steering.push(pivot);
      const roller = new TransformNode("wheel rotation", art.scene);
      roller.parent = pivot;
      rollers.push(roller);
      const wheel = art.cylinder("rubber tire", [0, 0, 0], 0.86, 0.86, 0.35, INK, roller);
      wheel.rotation.z = Math.PI / 2;
      for (const outer of [-1, 1]) {
        const shoulder = MeshBuilder.CreateTorus("rounded tire shoulder", { diameter: 0.73, thickness: 0.13, tessellation: 24 }, art.scene);
        art.place(shoulder, [outer * 0.13, 0, 0], art.material(INK), roller);
        shoulder.rotation.z = Math.PI / 2;
        const hub = art.cylinder("cream sidewall", [outer * 0.18, 0, 0], 0.65, 0.65, 0.026, CREAM, roller);
        hub.rotation.z = Math.PI / 2;
        const rim = art.cylinder("mint hub", [outer * 0.2, 0, 0], 0.42, 0.42, 0.03, MINT, roller);
        rim.rotation.z = Math.PI / 2;
      }
      for (let i = 0; i < 24; i++) {
        const angle = i / 24 * Math.PI * 2;
        const tread = art.box("tire tread", [0, Math.sin(angle) * 0.425, Math.cos(angle) * 0.425], [0.27, 0.018, 0.065], "#414858", roller);
        tread.rotation.x = Math.PI / 2 - angle;
      }
    }
    art.tube("exhaust", [[side * 0.62, 0.48, -0.77], [side * 0.85, 0.53, -1.25], [side * 0.85, 0.63, -1.66]], 0.105, "#677b8a", root);
    art.oval("lamp", [side * 0.38, 0.35, 1.2], [0.22, 0.18, 0.16], CREAM, root);
  }
  for (let i = 0; i < 5; i++) art.box("nose rib", [0, 0.46 - i * 0.04, 0.94 + i * 0.1], [0.48 - i * 0.05, 0.025, 0.034], CREAM, root);
  const wheel = MeshBuilder.CreateTorus("steering wheel", { diameter: 0.48, thickness: 0.047, tessellation: 24 }, art.scene);
  wheel.parent = root;
  wheel.material = art.material(INK);
  wheel.position.set(0, 1.13, 0.74);
  wheel.rotation.x = 0.6;
  art.tube("steering column", [[0, 0.5, 0.94], [0, 1.1, 0.76]], 0.035, "#687d87", root);
  const characters = [clutch(art), bramble(art)];
  for (let i = 0; i < characters.length; i++) {
    characters[i].root.parent = root;
    characters[i].pose(i === 0 ? 1 : 0);
  }

  const wing = new TransformNode("Mapwing assembly", art.scene);
  wing.parent = root;
  wing.position.set(0, 2.7, -0.27);
  art.tube("glider mast", [[0, -1.6, 0], [0, 0.1, 0]], 0.045, CREAM, wing);
  const rows: Vector3[][] = [];
  for (let row = 0; row <= 18; row++) {
    const x = (row / 18 - 0.5) * 7.7;
    const arc = 0.63 - Math.abs(x) * 0.11;
    const section: Vector3[] = [];
    for (let col = 0; col <= 8; col++) {
      const t = col / 8;
      section.push(new Vector3(x, arc + Math.sin(t * Math.PI) * 0.19, (t - 0.5) * (1.9 - Math.abs(x) * 0.18)));
    }
    rows.push(section);
    if (row % 3 === 0) art.tube("Mapwing rib", section.map(point => [point.x, point.y - 0.02, point.z]), 0.018, "#f9e8bc", wing);
  }
  for (let half = 0; half < 2; half++) {
    const canopy = MeshBuilder.CreateRibbon("Mapwing cloth", { pathArray: rows.slice(half * 9, half * 9 + 10), sideOrientation: Mesh.DOUBLESIDE }, art.scene);
    canopy.parent = wing;
    canopy.material = art.material(half ? "#f2ce6a" : "#66c2a3");
  }
  art.tube("wing edge", rows.map(row => [row[0].x, row[0].y, row[0].z]), 0.034, CREAM, wing);
  const flames = [-1, 1].map(side => {
    const flame = art.oval("boost flame", [side * 0.85, 0.63, -1.94], [0.23, 0.23, 0.75], "#72e5ff", root);
    flame.material = art.material("#72e5ff", true);
    return flame;
  });
  const sparks = [-1, 1].map(side => {
    const spark = art.oval("drift tell", [side * 1.02, -0.15, -1.51], [0.15, 0.13, 0.42], "#ffd46b", root);
    spark.material = art.material("#ffd46b", true);
    return spark;
  });
  let deployed = 0;
  art.batchModel(root, new Set([wheel, ...flames, ...sparks]));
  return {
    root,
    meshes: root.getChildMeshes().filter((mesh): mesh is Mesh => mesh instanceof Mesh),
    animate(state, input, dt, reducedMotion) {
      const visualDt = Math.min(dt, 0.05);
      deployed = lerp(deployed, state.mode === "glider" ? 1 : 0, Math.min(1, visualDt * 7));
      wing.setEnabled(deployed > 0.02);
      wing.scaling.set(deployed, deployed, deployed);
      for (const steer of steering) steer.rotation.y = input.steer * 0.43;
      for (const roller of rollers) roller.rotation.x += state.speed * visualDt / 0.43;
      wheel.rotation.y = input.steer * 0.4;
      const swap = clamp(1 - state.swapTime / 0.42, 0, 1);
      for (let i = 0; i < characters.length; i++) {
        const isFront = i === state.driver;
        const z = isFront ? 0.22 : -1;
        const previousZ = isFront ? -1 : 0.22;
        const rider = characters[i];
        const front = state.swapTime > 0 ? lerp(isFront ? 0 : 1, isFront ? 1 : 0, swap) : Number(isFront);
        rider.pose(front);
        rider.root.position.set(
          state.swapTime > 0 ? Math.sin(swap * Math.PI) * (i ? -0.65 : 0.65) : 0,
          0.62 + (state.swapTime > 0 ? Math.sin(swap * Math.PI) * 0.16 : 0) +
            (reducedMotion ? 0 : Math.sin(state.tick * 0.37 + i) * Math.min(Math.abs(state.speed) / 1400, 0.023)),
          state.swapTime > 0 ? lerp(previousZ, z, swap) : z,
        );
        rider.root.rotation.z = reducedMotion ? 0 : input.steer * Math.min(Math.abs(state.speed) / 220, 0.12) * (isFront ? -0.7 : 1);
      }
      flames.forEach(flame => {
        flame.setEnabled(state.boost > 0);
        flame.scaling.z = state.boost > 0 ? 0.85 + Math.sin(state.tick * 1.7) * 0.13 : 0;
      });
      sparks.forEach(spark => {
        spark.setEnabled(state.driftDirection !== 0 && state.driftCharge > 0);
        spark.material = art.material(state.driftCharge === 3 ? "#62e0ff" : state.driftCharge === 2 ? "#ff9551" : "#fff1c8", true);
      });
    },
  };
}
