import { expect, it } from "vitest";
import { AFTERGLOW } from "../../../../packages/content-layouts/afterglow";
import { createLayoutQuery } from "../../../../packages/content-layouts/query";
import { contactShadowHeight } from "./contact-shadow";

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
  expect(contactShadowHeight(course, { ...point, y: upper.y + .42 })).toBeCloseTo(upper.y + .02);
  expect(contactShadowHeight(course, { ...point, y: point.y + .42 })).toBeCloseTo(point.y + .02);
});
