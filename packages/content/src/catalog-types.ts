export const CHARACTER_IDS = ["clutch", "bramble", "pompa", "bront", "rivet", "pipvolt", "bollo", "hunkle"] as const;
export type CharacterId = typeof CHARACTER_IDS[number];
export const BODY_IDS = ["boiler-bug", "trail-mix", "gilt-trip", "velvet-hammer", "slipstream", "coil-bug", "air-pocket", "knuckle-bus"] as const;
export type BodyId = typeof BODY_IDS[number];
export const WHEEL_IDS = ["picnic", "button", "thimble", "bramble", "cushion", "spool"] as const;
export type WheelId = typeof WHEEL_IDS[number];
export const GLIDER_IDS = ["mapwing", "sunfan", "crosskite", "bellflower"] as const;
export type GliderId = typeof GLIDER_IDS[number];
export const PAINT_IDS = ["original", "pool", "sunset", "custard", "petal", "midnight"] as const;
export type PaintId = typeof PAINT_IDS[number];
export const DECAL_IDS = ["plain", "chevrons", "checks", "bolt"] as const;
export type DecalId = typeof DECAL_IDS[number];
export const PAIR_IDS = ["road-crew", "court-disorder", "live-wires", "mismatched-muscle"] as const;
export type PairId = typeof PAIR_IDS[number];
export const COURSE_IDS = ["butterbell", "afterglow", "escaluna", "tiltglass", "copperwhistle", "lastlight"] as const;
export type CourseId = typeof COURSE_IDS[number];
export const ITEM_IDS = [
  "slip", "bounce", "homing", "leader", "bomb", "boost", "triple-boost", "rapid-boost",
  "invincible", "shrink", "autopilot", "vision", "theft", "fire", "returning", "shockwave",
  "triple-slip", "triple-bounce", "triple-homing", "roadwork", "velvet", "static", "doubles",
] as const;
export type ItemId = typeof ITEM_IDS[number];

export interface KartBuild {
  characters: [CharacterId, CharacterId];
  body: BodyId;
  wheels: WheelId;
  glider: GliderId;
  paint: PaintId;
  decal: DecalId;
}

export const DEFAULT_BUILD: KartBuild = {
  characters: ["clutch", "bramble"], body: "boiler-bug", wheels: "picnic",
  glider: "mapwing", paint: "original", decal: "plain",
};

export interface HandlingStats {
  speed: number;
  acceleration: number;
  handling: number;
  grip: number;
  weight: number;
  offRoad: number;
  glideSpeed: number;
  glideLift: number;
  glideHandling: number;
}

export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  pair: PairId;
  body: BodyId;
  color: string;
  description: string;
}

export interface PartDefinition<Id extends string> {
  id: Id;
  name: string;
  description: string;
  stats: HandlingStats;
}

export interface ItemDefinition {
  id: ItemId;
  name: string;
  description: string;
  color: string;
  special: PairId | null;
}
