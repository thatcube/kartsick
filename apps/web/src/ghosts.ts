import { angleDifference, clamp, lerp, wrap } from "@kartsick/content";
import type { KartBuild } from "@kartsick/content";
import type { KartState } from "@kartsick/simulation";
import { finite, isRecord, parseBuild } from "./game-storage";

export type GhostFrame = readonly [tick: number, x: number, y: number, z: number, yaw: number, flags: number];
export interface GhostRun {
  version: 1;
  key: string;
  build: KartBuild;
  time: number;
  created: number;
  frames: GhostFrame[];
}
export interface GhostPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  mode: KartState["mode"];
  driver: 0 | 1;
  boost: boolean;
}
export const GHOST_STORAGE_KEY = "kartsick.ghosts.v1";
export const MAX_GHOST_FRAMES = 7200;
const MAX_GHOSTS = 6;
const MAX_GHOST_BYTES = 1_800_000;

export class GhostRecorder {
  private frames: GhostFrame[] = [];
  private previousTick = -6;
  overflowed = false;

  sample(state: KartState): void {
    if (state.tick <= this.previousTick || state.tick - this.previousTick < 6) return;
    if (this.frames.length >= MAX_GHOST_FRAMES) {
      this.overflowed = true;
      return;
    }
    this.previousTick = state.tick;
    this.frames.push([
      state.tick, Math.round(state.x * 100), Math.round(state.y * 100), Math.round(state.z * 100),
      Math.round(wrap(state.yaw + Math.PI, Math.PI * 2) * 10000 - Math.PI * 10000),
      state.driver | (state.mode === "glider" ? 2 : state.mode === "air" ? 4 : 0) | (state.boost > 0 ? 8 : 0),
    ]);
  }

  finish(key: string, build: KartBuild, time: number): GhostRun | null {
    if (this.overflowed || this.frames.length < 2) return null;
    return { version: 1, key, build: structuredClone(build), time, created: Date.now(), frames: this.frames.slice() };
  }
}

export function ghostPose(ghost: GhostRun, seconds: number): GhostPose | null {
  if (seconds < 0 || seconds > ghost.time || ghost.frames.length < 2) return null;
  const tick = seconds * 60;
  let low = 0;
  let high = ghost.frames.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (ghost.frames[middle][0] <= tick) low = middle;
    else high = middle;
  }
  const a = ghost.frames[low];
  const b = ghost.frames[high];
  const t = clamp((tick - a[0]) / Math.max(1, b[0] - a[0]), 0, 1);
  return {
    x: lerp(a[1], b[1], t) / 100, y: lerp(a[2], b[2], t) / 100, z: lerp(a[3], b[3], t) / 100,
    yaw: a[4] / 10000 + angleDifference(b[4] / 10000, a[4] / 10000) * t,
    driver: a[5] & 1 ? 1 : 0, mode: a[5] & 2 ? "glider" : a[5] & 4 ? "air" : "ground", boost: (a[5] & 8) !== 0,
  };
}

export function parseGhost(value: unknown): GhostRun {
  if (!isRecord(value) || value.version !== 1 || typeof value.key !== "string" || value.key.length > 128 ||
    !/^local-[1-4]:[a-z0-9.-]+:[a-z0-9.-]+:(50|100|150):(normal|mirror)$/.test(value.key) ||
    !finite(value.time, 0.01, 86400) || !finite(value.created, 0, 1e14) ||
    !Array.isArray(value.frames) || value.frames.length < 2 || value.frames.length > MAX_GHOST_FRAMES) {
    throw new TypeError("Unsupported time-trial ghost.");
  }
  let previous = -1;
  const frames: GhostFrame[] = value.frames.map(frame => {
    if (!Array.isArray(frame) || frame.length !== 6 ||
      !frame.every(value => typeof value === "number" && Number.isSafeInteger(value)) ||
      !finite(frame[0], previous + 1, 60 * 86400) ||
      !frame.slice(1, 4).every(value => finite(value, -1_000_000, 1_000_000)) ||
      !finite(frame[4], -31416, 31416) || !finite(frame[5], 0, 15) || (frame[5] & 6) === 6) throw new TypeError("Invalid ghost frame.");
    previous = frame[0];
    return [frame[0], frame[1], frame[2], frame[3], frame[4], frame[5]];
  });
  if (frames[0][0] > 6 || frames.at(-1)![0] > Math.ceil(value.time * 60) + 6) throw new TypeError("Ghost timing does not match its run.");
  return { version: 1, key: value.key, build: parseBuild(value.build), time: value.time, created: value.created, frames };
}

export function loadGhosts(storage: Pick<Storage, "getItem">): { ghosts: GhostRun[]; warning: string | null } {
  let raw: string | null;
  try {
    raw = storage.getItem(GHOST_STORAGE_KEY);
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
    return { ghosts: [], warning: "Ghost storage is unavailable. Time trials still work." };
  }
  if (!raw) return { ghosts: [], warning: null };
  try {
    if (raw.length > MAX_GHOST_BYTES) throw new TypeError("Ghost cache exceeds its limit.");
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > MAX_GHOSTS) throw new TypeError("Invalid ghost cache.");
    const ghosts = value.map(parseGhost);
    if (new Set(ghosts.map(ghost => ghost.key)).size !== ghosts.length) throw new TypeError("Duplicate ghost records.");
    return { ghosts, warning: null };
  } catch (error) {
    if (!(error instanceof SyntaxError) && !(error instanceof TypeError)) throw error;
    return { ghosts: [], warning: "Saved ghosts could not be read and were left untouched. Local times are stored separately." };
  }
}

export function saveGhost(storage: Pick<Storage, "getItem" | "setItem">, run: GhostRun): string | null {
  const incoming = parseGhost(run);
  const loaded = loadGhosts(storage);
  if (loaded.warning) return `${loaded.warning} The new ghost was not saved.`;
  const ghosts = [...loaded.ghosts.filter(ghost => ghost.key !== incoming.key), incoming]
    .sort((a, b) => b.created - a.created).slice(0, MAX_GHOSTS);
  let serialized = JSON.stringify(ghosts);
  while (serialized.length > MAX_GHOST_BYTES && ghosts.length > 1) {
    ghosts.pop();
    serialized = JSON.stringify(ghosts);
  }
  if (serialized.length > MAX_GHOST_BYTES) return "The time was saved, but this ghost exceeds the cache limit.";
  try {
    // One atomic localStorage replacement preserves the prior cache if quota is exhausted.
    storage.setItem(GHOST_STORAGE_KEY, serialized);
    return null;
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
    return "The time was saved, but the browser could not store its ghost. Allow storage or free some space.";
  }
}
