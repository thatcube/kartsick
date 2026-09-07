import type { CourseLayout, Point3 } from "./types";

const points: readonly Point3[] = [
  [-56, 3, -122], [-8, 3, -116], [52, 3, -108], [102, 4, -82],
  [120, 6, -32], [118, 10, 18], [110, 19, 66], [100, 15, 112],
  [72, 13, 154], [24, 11, 174], [-22, 8, 165], [-50, 7, 130],
  [-58, 6, 86], [-82, 5, 54], [-118, 4, 65], [-154, 3, 88],
  [-190, 3, 68], [-206, 3, 20], [-196, 4, -28], [-167, 7, -64],
  [-138, 10, -61], [-110, 9, -68], [-90, 6, -87], [-82, 4, -101],
];

/** The table is recessed below every road, including the unsupported launch slot. */
export const TILTGLASS: CourseLayout = {
  id: "tiltglass",
  name: "Tiltglass Arcade",
  version: "tiltglass-2",
  format: "laps",
  points,
  halfWidth: 6.7,
  shoulderWidth: 7.3,
  checkpoints: [0, 0.125, 0.235, 0.32, 0.43, 0.49, 0.64, 0.76, 0.87, 0.96],
  sectors: [],
  glides: [{ start: 0.253, end: 0.279 }],
  rails: [[0, 0.24], [0.292, 0.48], [0.65, 1]],
  shortcuts: [{
    id: "underflipper",
    name: "Under-flipper service lane",
    from: 0.5,
    to: 0.625,
    points: [points[12], [-91, 4.5, 87], [-123, 3.2, 101], points[15]],
    halfWidth: 3.1,
    rough: true,
  }],
  hazards: [
    {
      id: "chrome-crossing", kind: "sweeper", position: [-8, 4.65, -116],
      radius: 1.65, height: 3.3, strength: 7.5,
      motion: { axis: "z", amplitude: 9.5, period: 9.8, phase: Math.PI / 2 },
    },
    {
      id: "west-flipper", kind: "sweeper", position: [-206, 4.2, 20],
      radius: 1.45, height: 2.4, strength: 6,
      motion: { axis: "x", amplitude: 4.5, period: 7.6, phase: 0.8 },
    },
    { id: "crown-bumper", kind: "bumper", position: [-22, 9.1, 162], radius: 1.3, height: 2.2, strength: 6 },
    { id: "return-bumper", kind: "bumper", position: [-87.5, 7.1, -85], radius: 1.2, height: 2.2, strength: 5.5 },
  ],
  obstacles: [
    { id: "score-tower", shape: "circle", position: [-31, -3, 7], radius: 9, height: 36 },
    { id: "plunger-housing", shape: "circle", position: [136, -3, 64], radius: 6.5, height: 20 },
    { id: "crown-drum", shape: "circle", position: [27, -3, 144], radius: 8, height: 16 },
    { id: "service-cam", shape: "circle", position: [-104, -3, 113], radius: 5, height: 16 },
    { id: "west-spool", shape: "circle", position: [-171, -3, 23], radius: 7, height: 12 },
    { id: "return-coil", shape: "circle", position: [-142, -3, -14], radius: 5.8, height: 12 },
  ],
  palette: {
    sky: "#333d67", road: "#eee3cc", verge: "#b69370", rail: "#c7a15d",
    accent: "#d84756", secondary: "#263957", ground: "#26344f",
  },
  bounds: { minX: -260, maxX: 180, minZ: -165, maxZ: 220 },
  groundHeight: () => -3,
  waterLevel: -20,
  isWater: () => false,
};
