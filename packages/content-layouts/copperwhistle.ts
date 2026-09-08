import type { CourseLayout, Point3 } from "./types";
import { mound, routeCutTerrain } from "./terrain";

const points: readonly Point3[] = [
  [30, 18, -170], [88, 19, -158], [139, 24, -118], [156, 28, -62],
  [146, 30, -4], [111, 30, 42], [70, 37, 87], [40, 32, 136],
  [6, 29, 180], [-48, 28, 185], [-97, 27, 154], [-119, 26, 103],
  [-111, 24, 57], [-124, 22, 12], [-165, 21, -3], [-211, 23, -2],
  [-239, 25, -28], [-226, 26, -77], [-183, 24, -90], [-143, 22, -81],
  [-106, 20, -100], [-91, 18, -143], [-63, 18, -174], [-18, 18, -181],
];
const bounds = { minX: -300, maxX: 220, minZ: -240, maxZ: 235 };
const innerBough: readonly Point3[] = [points[12], [-143, 23.7, 39], [-181, 23.2, 25], points[15]];
const groundHeight = routeCutTerrain({
  points, closed: true, shortcuts: [innerBough], bounds, clearance: 63,
  height: (x, z) => -65 + 28 * mound(x, z, 75, -45, 70, 87)
    + 22 * mound(x, z, -203, 134, 68, 70) - 23 * mound(x, z, -62, 12, 38, 148),
});

const trees: readonly Point3[] = [
  [15, -15, -143], [91, -15, -132], [131, -15, -57], [171, -15, 9],
  [125, -15, 67], [94, -15, 101], [22, -15, 131], [30, -15, 188],
  [-43, -15, 157], [-118, -15, 169], [-144, -15, 105], [-84, -15, 56],
  [-104, -15, 5], [-177, -15, -36], [-213, -15, 32], [-265, -15, -33],
  [-228, -15, -105], [-153, -15, -113], [-68, -15, -121], [-71, -15, -199],
  [-14, -15, -210], [62, -15, -196], [180, -15, -106], [83, -15, 152],
];

export const COPPERWHISTLE: CourseLayout = {
  id: "copperwhistle",
  name: "Copperwhistle Canopy",
  version: "copperwhistle-3",
  format: "laps",
  points,
  halfWidth: 6.5,
  shoulderWidth: 7.1,
  checkpoints: [0, 0.13, 0.235, 0.32, 0.435, 0.49, 0.645, 0.76, 0.87, 0.955],
  sectors: [],
  glides: [{ start: 0.253, end: 0.278 }],
  rails: [[0, 0.242], [0.295, 0.48], [0.65, 1]],
  shortcuts: [{
    id: "inner-bough",
    name: "Inner-bough cut",
    from: 0.5,
    to: 0.625,
    points: innerBough,
    halfWidth: 3,
    rough: true,
  }],
  hazards: [
    {
      id: "seed-basket-east", kind: "sweeper", position: [156, 29.2, -62],
      radius: 1.35, height: 2.4, strength: 4.7,
      motion: { axis: "x", amplitude: 4.2, period: 8.4, phase: 1.2 },
    },
    {
      id: "seed-basket-west", kind: "sweeper", position: [-225, 27.2, -76],
      radius: 1.3, height: 2.4, strength: 4.7,
      motion: { axis: "z", amplitude: 4, period: 9.2, phase: 2.4 },
    },
    {
      id: "leaf-draft", kind: "gust", position: [61, 37, 107],
      radius: 5.7, height: 12, strength: 3.2,
      motion: { axis: "x", amplitude: 1.6, period: 11, phase: 0.3 },
    },
  ],
  obstacles: trees.map(([x, y, z], index) => {
    const height = 100 + index % 3 * 6;
    const bottom = Math.min(y - height / 2, groundHeight(x, z) - 1);
    return { id: `canopy-tree-${index}`, shape: "circle", position: [x, bottom, z],
      radius: index % 4 === 0 ? 4 : 3.2, height: y + height / 2 - bottom };
  }),
  palette: {
    sky: "#f4e5c9", road: "#ba885b", verge: "#896346", rail: "#efd9a3",
    accent: "#c86f40", secondary: "#427c79", ground: "#756e4a",
  },
  bounds,
  groundHeight,
  waterLevel: -90,
  isWater: () => false,
};
