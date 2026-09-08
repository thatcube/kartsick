import type { CourseLayout, CourseObstacle, Point3 } from "./types";
import { mound, routeCutTerrain } from "./terrain";

const points: readonly Point3[] = [
  [0, 354, 0], [45, 352, 55], [145, 345, 85], [250, 337, 110],
  [290, 334, 150], [250, 330, 195], [140, 320, 230], [0, 309, 250],
  [-155, 296, 275], [-250, 288, 300], [-286, 284, 345], [-242, 280, 395],
  [-135, 271, 420], [0, 260, 442], [145, 248, 465], [245, 240, 490],
  [285, 236, 535], [248, 231, 585], [130, 220, 612], [-5, 209, 635],
  [-145, 198, 658], [-240, 190, 690], [-278, 185, 740], [-230, 181, 795],
  [-125, 172, 825], [0, 162, 850], [132, 150, 880], [235, 141, 915],
  [272, 137, 965], [225, 133, 1020], [110, 123, 1050], [-10, 113, 1080],
  [-140, 102, 1110], [-232, 94, 1150], [-261, 90, 1200], [-215, 86, 1255],
  [-118, 78, 1290], [-30, 70, 1320], [0, 67, 1360], [0, 73, 1400],
  [0, 70, 1432], [0, 53, 1488], [0, 51, 1540], [65, 44, 1585],
  [180, 36, 1620], [220, 30, 1660], [180, 25, 1710], [70, 18, 1760],
  [0, 14, 1835],
];

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const waterLevel = 3;
const bounds = { minX: -576, maxX: 576, minZ: -128, maxZ: 2176 };
const goatLedge: readonly Point3[] = [points[8], [-182, 289, 321], [-180, 280, 378], points[12]];

function mountain(x: number, z: number): number {
  let index = 0;
  while (index < points.length - 2 && points[index + 1][2] < z) index++;
  const a = points[index], b = points[index + 1];
  const t = clamp((z - a[2]) / (b[2] - a[2]));
  const profile = a[1] + (b[1] - a[1]) * t;
  const viaduct = 32 * Math.exp(-(((z - 858) / 58) ** 2));
  const gorge = 42 * Math.exp(-(((z - 1455) / 62) ** 2));
  const lake = smooth((1 - Math.hypot((x - 447) / 203, (z - 1695) / 420)) / 0.27);
  const ridge = smooth((Math.abs(x) - 280) / 190) * (95 + 75 * Math.sin(z * 0.006 + 1) ** 2);
  const spurs = 68 * mound(x, z, 30, 344, 180, 42) + 76 * mound(x, z, -25, 544, 160, 44)
    + 64 * mound(x, z, 30, 741, 145, 50) + 60 * mound(x, z, -15, 968, 150, 53)
    + 48 * mound(x, z, 15, 1198, 135, 52);
  const valley = profile - 7 - viaduct - gorge + ridge + spurs;
  return valley * (1 - lake) - 13 * lake;
}

const groundHeight = routeCutTerrain({
  points, closed: false, shortcuts: [goatLedge], bounds,
  height: mountain, clearance: 5, cutWidth: 34,
});

function vergeStone(index: number, side: number): CourseObstacle {
  const a = points[index - 1], p = points[index], b = points[index + 1];
  const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const x = p[0] + (b[2] - a[2]) / length * side * 9.4;
  const z = p[2] - (b[0] - a[0]) / length * side * 9.4;
  return {
    id: `lastlight-mile-stone-${index}`, shape: "circle",
    position: [x, groundHeight(x, z), z], radius: 1.15, height: 5.2,
  };
}

export const LASTLIGHT: CourseLayout = {
  id: "lastlight",
  name: "Lastlight Switchbacks",
  version: "lastlight-descent-2",
  format: "sectors",
  points,
  halfWidth: 6.7,
  shoulderWidth: 7.3,
  checkpoints: [0, 4 / 48, 7 / 48, 13 / 48, 16 / 48, 20 / 48, 24 / 48, 28 / 48, 32 / 48, 36 / 48, 39 / 48, 42 / 48, 45 / 48, 1],
  sectors: [16 / 48, 32 / 48],
  glides: [{ start: 40 / 48, end: 41 / 48 }],
  rails: [[0.01, 7.7 / 48], [8.3 / 48, 11.7 / 48], [12.3 / 48, 39.85 / 48], [41.15 / 48, 0.99]],
  shortcuts: [{
    id: "sunset-goat-ledge",
    name: "Sunset goat ledge",
    from: 8 / 48, to: 12 / 48,
    points: goatLedge,
    halfWidth: 3.4,
    rough: true,
  }],
  hazards: [{
    id: "lastlight-works-crossing", kind: "sweeper",
    position: [130, 221.1, 612], radius: 1.3, height: 2.2, strength: 5,
    motion: { axis: "z", amplitude: 11, period: 9, phase: 0.6 },
  }, {
    id: "lastlight-lantern-crossing", kind: "sweeper",
    position: [110, 124.1, 1050], radius: 1.3, height: 2.2, strength: 4.5,
    motion: { axis: "z", amplitude: 11, period: 11, phase: 2.1 },
  }],
  obstacles: [vergeStone(3, -1), vergeStone(6, 1), vergeStone(14, -1), vergeStone(21, 1), vergeStone(30, -1), vergeStone(44, 1)],
  palette: {
    sky: "#c8b9df", road: "#817689", verge: "#c29471", rail: "#f5e5c3",
    accent: "#f5ac69", secondary: "#526b81", ground: "#b6907c",
  },
  bounds,
  groundHeight,
  waterLevel,
  isWater: (x, z) => x >= -576 && x <= 576 && z >= -128 && z <= 2176 && groundHeight(x, z) < waterLevel,
};
