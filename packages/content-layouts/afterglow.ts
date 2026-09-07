import type { CourseLayout, CourseObstacle, Point3 } from "./types";

const points: readonly Point3[] = [
  [-130, 18, -135], [-65, 18, -140], [5, 19, -140], [75, 22, -135],
  [125, 26, -115], [150, 31, -70], [152, 35, -15], [152, 30, 45],
  [143, 29, 100], [107, 28, 143], [48, 26, 161], [-8, 23, 145],
  [-43, 20, 107], [-88, 18, 100], [-138, 17, 129], [-186, 18, 106],
  [-200, 21, 52], [-164, 23, 13], [-133, 24, -19], [-156, 22, -51],
  [-210, 20, -48], [-242, 18, -76], [-221, 18, -118], [-177, 18, -132],
];

export const AFTERGLOW: CourseLayout = {
  id: "afterglow",
  name: "Afterglow Airway",
  version: "afterglow-1",
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
    points: [[-133, 24, -19], [-141, 19, -46], [-173, 15, -81], [-221, 18, -118]],
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
  bounds: { minX: -390, maxX: 330, minZ: -300, maxZ: 310 },
  groundHeight: () => -7,
  waterLevel: -8,
  isWater: () => false,
};
