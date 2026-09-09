import { getCourse } from "@kartsick/content";
import type { CourseId } from "@kartsick/content";
import type { Atelier } from "./geometry";
import { makeWorld } from "./world";
import type { CourseWorld } from "./world-types";
import { makeAfterglowWorld } from "./worlds/afterglow";
import { makeEscalunaWorld } from "./worlds/escaluna";
import { makeLastlightWorld } from "./worlds/lastlight";
import { makeTiltglassWorld } from "./worlds/tiltglass";
import { makeCopperwhistleWorld } from "./worlds/copperwhistle";
import { makeCourseGroundcover } from "./course-groundcover";

const builders = {
  butterbell: makeWorld, afterglow: makeAfterglowWorld, escaluna: makeEscalunaWorld,
  lastlight: makeLastlightWorld, tiltglass: makeTiltglassWorld, copperwhistle: makeCopperwhistleWorld,
};

export function makeCourseWorld(art: Atelier, id: CourseId): CourseWorld {
  const build = builders[id];
  if (!Object.hasOwn(builders, id)) throw new RangeError(`The ${id} world has not been connected yet.`);
  const course = getCourse(id), world = build(art, course);
  if (id !== "butterbell") makeCourseGroundcover(art, course);
  return world;
}
