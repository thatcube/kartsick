import type { Mesh } from "@babylonjs/core/Meshes/mesh";

export interface CourseWorld {
  casters: Mesh[];
  /** time follows the race clock. Reduced motion never stops a gameplay hazard. */
  animate(time: number, reducedMotion?: boolean): void;
  environment?: {
    sky: string;
    fog?: string;
    skyStyle?: "day" | "dusk" | "indoor";
    fogStart: number;
    fogEnd: number;
    sun: string;
    sunIntensity: number;
    fill: string;
    fillIntensity: number;
    ground: string;
  };
}
