import { Color3 } from "@babylonjs/core/Maths/math.color";
import { FresnelParameters } from "@babylonjs/core/Materials/fresnelParameters";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";

export type SurfaceFinish = "matte" | "paint" | "metal" | "rubber" | "fabric" | "skin" | "wood";

const finishes: Record<SurfaceFinish, { specular: number; power: number; roughness: number; reflection: number }> = {
  matte: { specular: .045, power: 20, roughness: .9, reflection: 0 },
  paint: { specular: .48, power: 112, roughness: .14, reflection: .3 },
  metal: { specular: .8, power: 88, roughness: .2, reflection: .65 },
  rubber: { specular: .1, power: 24, roughness: .8, reflection: 0 },
  fabric: { specular: .035, power: 12, roughness: 1, reflection: 0 },
  skin: { specular: .17, power: 38, roughness: .48, reflection: 0 },
  wood: { specular: .095, power: 30, roughness: .65, reflection: 0 },
};

export function applySurfaceFinish(material: StandardMaterial, finish: SurfaceFinish, environment: BaseTexture | null): void {
  const profile = finishes[finish];
  material.specularColor = new Color3(profile.specular, profile.specular, profile.specular);
  material.specularPower = profile.power;
  material.roughness = profile.roughness;
  material.metadata = { surfaceFinish: finish };
  if (environment && profile.reflection > 0) {
    material.reflectionTexture = environment;
    material.reflectionFresnelParameters = new FresnelParameters({
      leftColor: new Color3(profile.reflection, profile.reflection, profile.reflection),
      rightColor: new Color3(profile.reflection * .22, profile.reflection * .22, profile.reflection * .22),
      power: 3,
    });
  }
}
