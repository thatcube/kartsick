import type { CourseLayout, CourseObstacle, Point3 } from "./types";
import { mound, routeCutTerrain } from "./terrain";

const points: readonly Point3[] = [
  [-130, 18, -135], [-65, 18, -140], [5, 19, -140], [75, 22, -135],
  [125, 26, -115], [150, 31, -70], [152, 35, -15], [152, 30, 45],
  [143, 29, 100], [107, 28, 143], [48, 26, 161], [-8, 23, 145],
  [-43, 20, 107], [-88, 18, 100], [-138, 17, 129], [-194, 18, 108],
  [-202, 21, 51], [-155, 23, 12], [-135, 24, -22], [-151, 22, -46],
  [-215, 20, -54], [-237, 18, -78], [-221, 18, -118], [-177, 18, -132],
];
const bounds = { minX: -390, maxX: 330, minZ: -300, maxZ: 310 };
const returnPoints: readonly Point3[] = [points[18], [-144, 19, -49], [-173, 15, -81], points[22]];
const groundHeight = routeCutTerrain({
  points, closed: true, shortcuts: [returnPoints], bounds, clearance: 6,
  height: (x, z) => -7 + 20 * mound(x, z, -270, 100, 63, 130)
    + 15 * mound(x, z, 80, 207, 130, 43) - 6 * mound(x, z, 200, 36, 27, 98),
});

export const AFTERGLOW: CourseLayout = {
  id: "afterglow",
  name: "Afterglow Airway",
  version: "afterglow-2",
  format: "laps",
  points,
  halfWidth: 6.7,
  shoulderWidth: 7.4,
  checkpoints: [0, 0.125, 0.23, 0.32, 0.46, 0.59, 0.73, 0.94],
  sectors: [],
  glides: [{ start: 0.25, end: 0.275 }],
  rails: [[0, 0.235], [0.285, 0.735], [0.775, 0.89], [0.935, 1]],
  shortcuts: [{
    id: "low-return",
    name: "Express return",
    from: 18 / 24,
    to: 22 / 24,
    points: returnPoints,
    halfWidth: 3.5,
    rough: true,
  }],
  hazards: [{
    id: "maintenance-pod",
    kind: "sweeper",
    position: [-65, 19.1, -140],
    radius: 1.65,
    height: 2.2,
    strength: 8,
    motion: { axis: "z", amplitude: 5.2, period: 7.5, phase: 0.6 },
  }, {
    id: "arrival-baggage-pod", kind: "sweeper",
    position: [48, 27.1, 161], radius: 1.45, height: 2.2, strength: 6,
    motion: { axis: "z", amplitude: 8.5, period: 10.5, phase: 1.4 },
  }],
  obstacles: [
    { id: "terminal-core", shape: "box", position: [-15, -7, -94], halfX: 31, halfZ: 11, height: 39 },
    { id: "control-tower", shape: "circle", position: [83, -7, -83], radius: 5.5, height: 64 },
    { id: "arrival-planter", shape: "circle", position: [-101, 15, 86], radius: 3.6, height: 6 },
    { id: "hangar-island", shape: "box", position: [-205, -7, 0], halfX: 12, halfZ: 13, height: 27 },
    { id: "departure-pier-a", shape: "circle", position: [130, -7, 3], radius: 1.5, height: 42 },
    { id: "departure-pier-b", shape: "circle", position: [174, -7, 3], radius: 1.5, height: 42 },
    ...points.flatMap<CourseObstacle>(([x, y, z], index) => index % 2 || index === 6 ? [] : [{
      id: `deck-support-${index}`, shape: "circle", position: [x, -7, z],
      radius: 1.35, height: y + 6.65,
    }]),
  ],
  palette: {
    sky: "#6667a9", road: "#555c8d", verge: "#c09098", rail: "#ffd0ad",
    accent: "#ef78b3", secondary: "#80e4df", ground: "#3b4e79",
  },
  bounds,
  groundHeight,
  waterLevel: -8,
  isWater: () => false,
};
