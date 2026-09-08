import type { CourseLayout } from "./types";
import { latticeTerrain, mound, smoothTerrain } from "./terrain";

const bounds = { minX: -275, maxX: 280, minZ: -250, maxZ: 175 };
const groundHeight = latticeTerrain(bounds, (x, z) =>
  8 * smoothTerrain((mound(x, z, -243, 19, 28, 65) - 0.35) / 0.45)
  + 6 * smoothTerrain((mound(x, z, 102, -100, 30, 24) - 0.4) / 0.5));

export const ESCALUNA: CourseLayout = {
  id: "escaluna",
  name: "Escaluna Galleria",
  version: "escaluna-3",
  format: "laps",
  points: [
    [-112, 1.2, -91], [-63, 1.2, -99], [-10, 1.2, -91], [34, 2, -68],
    [67, 6, -26], [83, 12, 24], [112, 16, 67], [153, 16, 78],
    [181, 15, 46], [188, 13, -6], [188, 15, -61], [181, 13, -113],
    [151, 11, -154], [100, 4, -176], [37, 1.2, -171], [-25, 1.2, -194],
    [-99, 1.2, -201], [-168, 1.2, -164], [-178, 1.2, -89], [-173, 2, -25],
    [-145, 5, 31], [-98, 7, 72], [-44, 7, 71], [-15, 5, 33],
    [-37, 2, -3], [-90, 1.2, -13], [-126, 1.2, -42],
  ],
  halfWidth: 6.5,
  shoulderWidth: 7.2,
  checkpoints: [0, 0.11, 0.24, 0.325, 0.42, 0.51, 0.68, 0.78, 0.9],
  sectors: [],
  glides: [{ start: 10 / 27, end: 10.5 / 27 }],
  rails: [[0.12, 0.355], [0.4, 0.49], [0.70, 0.90]],
  shortcuts: [{
    id: "loading-dock",
    name: "Loading dock",
    from: 14 / 27,
    to: 18 / 27,
    points: [[37, 1.2, -171], [-27, 1.2, -137], [-98, 1.2, -117], [-151, 1.2, -99], [-178, 1.2, -89]],
    halfWidth: 3,
    rough: true,
  }],
  hazards: [{
    id: "cleaning-cart",
    kind: "sweeper",
    position: [-63, 2.05, -99],
    radius: 1.25,
    height: 1.7,
    strength: 6,
    motion: { axis: "z", amplitude: 5, period: 9, phase: Math.PI / 2 },
  }, {
    id: "display-satellite",
    kind: "bumper",
    position: [-91, 8, 69],
    radius: 1.3,
    height: 2,
    strength: 8,
    motion: { axis: "z", amplitude: 3.5, period: 12, phase: 0.4 },
  }],
  obstacles: [
    { id: "atrium-fountain", shape: "circle", position: [-76, 0, 26], radius: 11, height: 2.7 },
    { id: "citrus-planter", shape: "circle", position: [-148, 0, -9], radius: 3.8, height: 3.4 },
    { id: "promenade-planter", shape: "circle", position: [101, 12, 48], radius: 3.5, height: 6 },
    { id: "dock-parcel", shape: "box", position: [-74, 0, -136], halfX: 3, halfZ: 2.4, height: 3.6 },
    { id: "court-kiosk", shape: "circle", position: [115, 0, -116], radius: 7.5, height: 10 },
  ],
  palette: {
    sky: "#aecadf", road: "#d0cbe3", verge: "#bca5b8", rail: "#fff2db",
    accent: "#b295d1", secondary: "#79cbdb", ground: "#d4ccca",
  },
  bounds,
  groundHeight,
  waterLevel: -1,
  isWater: () => false,
};
