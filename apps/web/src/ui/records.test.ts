import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CUPS } from "@kartsick/content";
import { freshGame } from "../game-storage";
import { RecordsPanel } from "./records";

describe("earned circuit names", () => {
  it.each(CUPS)("uses the catalog name for the $id medal", cup => {
    const save = freshGame();
    save.medals = [{ cup: cup.id, speedClass: 100, mirror: false, medal: "gold", points: cup.courses.length * 10 }];
    const markup = renderToStaticMarkup(createElement(RecordsPanel, {
      save, close() {}, courseNames: {}, ghostKeys: new Set<string>(),
    }));
    expect(markup).toContain(`<b>${cup.name}</b>`);
  });
});
