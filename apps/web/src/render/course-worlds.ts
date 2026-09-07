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

export function makeCourseWorld(art: Atelier, id: CourseId): CourseWorld {
  if (id === "butterbell") {
    const world = makeWorld(art);
    return { casters: world.casters, animate: (time, reducedMotion) => world.animate(reducedMotion ? 0 : time) };
  }
  if (id === "afterglow") return makeAfterglowWorld(art, getCourse(id));
  if (id === "escaluna") return makeEscalunaWorld(art, getCourse(id));
  if (id === "lastlight") return makeLastlightWorld(art, getCourse(id));
  if (id === "tiltglass") return makeTiltglassWorld(art, getCourse(id));
  if (id === "copperwhistle") return makeCopperwhistleWorld(art, getCourse(id));
  throw new RangeError(`The ${id} world has not been connected yet.`);
}
