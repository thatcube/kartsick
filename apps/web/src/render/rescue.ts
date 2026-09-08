import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Atelier } from "./geometry";

/** A little brass bell tug: the cable and four-point sling visibly hold the kart. */
export function makeTowbell(art: Atelier): { root: TransformNode; rotor: TransformNode } {
  const root = new TransformNode("Towbell rescue tug", art.scene);
  const bell = new TransformNode("Towbell enamel hull", art.scene);
  bell.parent = root;
  art.sculpt("bell-shaped tug", [
    [3, .55, .45], [3.12, .65, .52], [3.32, .42, .38], [3.85, .35, .3], [4.02, .12, .12],
  ], "#53bdb0", bell, .65);
  art.cylinder("brass bell lip", [0, 3.07, 0], 1.28, 1.35, .13, "#f5cc6a", bell);
  for (const side of [-1, 1]) {
    art.oval("rescue lamp", [side * .23, 3.52, -.31], [.18, .24, .12], "#fff4cb", bell);
    art.oval("lamp pupil", [side * .23, 3.51, -.38], [.075, .12, .045], "#254853", bell);
    art.tube("sling straps", [[0, 1.65, 0], [side * .82, .48, -.5], [side * .82, .2, .6]], .045, "#f5cc6a", bell);
  }
  art.tube("tow cable", [[0, 1.6, 0], [0, 3, 0]], .035, "#eee4ca", bell);
  art.oval("winch hook", [0, 1.64, 0], [.24, .31, .18], "#f5cc6a", bell);
  art.batchModel(bell, new Set(), true);
  const rotor = new TransformNode("Towbell propeller", art.scene);
  rotor.parent = root;
  rotor.position.y = 4.08;
  art.cylinder("propeller hub", [0, .08, 0], .22, .22, .22, "#f5cc6a", rotor);
  for (const angle of [0, Math.PI / 2]) {
    const blade = art.oval("cream propeller", [0, .13, 0], [2.1, .06, .22], "#fff0c8", rotor, .6, 8);
    blade.rotation.y = angle;
  }
  art.batchModel(rotor, new Set(), true);
  root.setEnabled(false);
  return { root, rotor };
}
