import { STUDY_VERSION } from "@kartsick/content";

export type Quality = "low" | "balanced" | "high";
export type ButtonAction = "throttle" | "brake" | "drift" | "swap" | "recover";
export type KeyAction = ButtonAction | "left" | "right";
export interface Settings {
  master: number;
  music: number;
  effects: number;
  quality: Quality;
  reducedMotion: boolean;
  shake: boolean;
  deadzone: number;
  sensitivity: number;
  invertPitch: boolean;
  buttons: Record<ButtonAction, number>;
  keys: Record<KeyAction, string>;
}
export interface SaveData {
  version: 1;
  courseVersion: string;
  settings: Settings;
  bestLap: number | null;
  bestRun: number | null;
}
export const STORAGE_KEY = "kartsick.study.v1";
export const DEFAULT_SETTINGS: Settings = {
  master: 0.65, music: 0.32, effects: 0.7, quality: "balanced",
  reducedMotion: false, shake: false, deadzone: 0.14, sensitivity: 1,
  invertPitch: false,
  buttons: { throttle: 7, brake: 6, drift: 5, swap: 3, recover: 2 },
  keys: { throttle: "KeyW", brake: "KeyS", left: "KeyA", right: "KeyD", drift: "Space", swap: "KeyC", recover: "KeyR" },
};

export function freshSave(): SaveData {
  return { version: 1, courseVersion: STUDY_VERSION, settings: structuredClone(DEFAULT_SETTINGS), bestLap: null, bestRun: null };
}

const bounded = (value: unknown, low: number, high: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function validSettings(value: unknown): value is Settings {
  if (!record(value) || !record(value.buttons) || !record(value.keys)) return false;
  return bounded(value.master, 0, 1) && bounded(value.music, 0, 1) && bounded(value.effects, 0, 1) &&
    ["low", "balanced", "high"].includes(String(value.quality)) &&
    typeof value.reducedMotion === "boolean" && typeof value.shake === "boolean" &&
    typeof value.invertPitch === "boolean" && bounded(value.deadzone, 0.03, 0.4) &&
    bounded(value.sensitivity, 0.6, 1.5) &&
    Object.keys(DEFAULT_SETTINGS.buttons).every(key => record(value.buttons) && bounded(value.buttons[key], 0, 31) && Number.isInteger(value.buttons[key])) &&
    Object.keys(DEFAULT_SETTINGS.keys).every(key => record(value.keys) && typeof value.keys[key] === "string" && /^(Key[A-Z]|Digit[0-9]|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight|Arrow(Up|Down|Left|Right))$/.test(value.keys[key]));
}

export function loadSave(storage: Pick<Storage, "getItem">): { data: SaveData; warning: string | null } {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
    return { data: freshSave(), warning: "Browser storage is unavailable. Settings and times will last only for this visit." };
  }
  if (!raw) return { data: freshSave(), warning: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { data: freshSave(), warning: "The saved study data could not be read. Defaults are active; the unreadable save has not been overwritten." };
  }
  if (!record(parsed) || parsed.version !== 1 || !validSettings(parsed.settings) ||
    !(parsed.bestLap === null || bounded(parsed.bestLap, 0.01, 86400)) ||
    !(parsed.bestRun === null || bounded(parsed.bestRun, 0.01, 86400)) ||
    typeof parsed.courseVersion !== "string") {
    return { data: freshSave(), warning: "The saved study data uses an unsupported format. Defaults are active; it has not been overwritten." };
  }
  return {
    data: {
      version: 1, courseVersion: STUDY_VERSION, settings: parsed.settings,
      bestLap: parsed.courseVersion === STUDY_VERSION ? parsed.bestLap : null,
      bestRun: parsed.courseVersion === STUDY_VERSION ? parsed.bestRun : null,
    },
    warning: parsed.courseVersion === STUDY_VERSION ? null : "The study layout changed, so its old records are no longer comparable. Your settings were kept.",
  };
}

export function persistSave(storage: Pick<Storage, "setItem">, data: SaveData): string | null {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return null;
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
    return "Your browser could not save this change. Free some site storage or allow local storage; this visit can continue.";
  }
}

export function formatTime(seconds: number | null): string {
  if (seconds === null) return "--:--.---";
  const milliseconds = Math.floor(Math.max(0, seconds) * 1000);
  return `${Math.floor(milliseconds / 60000)}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0")}.${String(milliseconds % 1000).padStart(3, "0")}`;
}
