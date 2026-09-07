import {
  BODY_IDS, CHARACTER_IDS, COURSE_IDS, DECAL_IDS, DEFAULT_BUILD, GLIDER_IDS, PAINT_IDS, WHEEL_IDS,
} from "@kartsick/content";
import type { CourseId, KartBuild } from "@kartsick/content";
import {
  DEFAULT_GAME_SETTINGS, GAME_BUTTON_ACTIONS, GAME_KEY_ACTIONS, validButton, validKey,
} from "./game-controls";
import type { Calibration, GameSettings } from "./game-controls";
import { DEFAULT_SETTINGS, loadSave, STORAGE_KEY as STUDY_STORAGE_KEY } from "./storage";

export const GAME_STORAGE_KEY = "kartsick.save.v2";
export interface PlayerProfile {
  id: string;
  name: string;
  build: KartBuild;
  calibration: Calibration | null;
}
export interface RaceRecord {
  key: string;
  profileId: string;
  courseId: CourseId;
  courseVersion: string;
  speedClass: 50 | 100 | 150;
  mirror: boolean;
  time: number;
  bestLap: number;
  build: KartBuild;
  date: number;
}
export interface CupMedal {
  cup: "town" | "horizon" | "tour";
  speedClass: 50 | 100 | 150;
  mirror: boolean;
  medal: "bronze" | "silver" | "gold";
  points: number;
}
export interface GameSave {
  version: 2;
  settings: GameSettings;
  profiles: PlayerProfile[];
  presets: { name: string; build: KartBuild }[];
  records: RaceRecord[];
  medals: CupMedal[];
  races: number;
  wins: number;
}
export interface LoadedGame {
  data: GameSave;
  warning: string | null;
  canWrite: boolean;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export const finite = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
const member = <T extends string>(value: unknown, values: readonly T[]): value is T =>
  typeof value === "string" && values.some(candidate => candidate === value);
export function validNickname(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && Array.from(value).length >= 1 &&
    Array.from(value).length <= 24 && !/[\u0000-\u001f\u007f]/.test(value);
}
export function validCalibration(value: unknown): value is Calibration {
  return isRecord(value) && finite(value.deadzone, 0.03, 0.4) && finite(value.sensitivity, 0.6, 1.5) &&
    typeof value.invertPitch === "boolean";
}
export function parseBuild(value: unknown): KartBuild {
  if (!isRecord(value) || !Array.isArray(value.characters) || value.characters.length !== 2 ||
    !member(value.characters[0], CHARACTER_IDS) || !member(value.characters[1], CHARACTER_IDS) ||
    value.characters[0] === value.characters[1] || !member(value.body, BODY_IDS) ||
    !member(value.wheels, WHEEL_IDS) || !member(value.glider, GLIDER_IDS) ||
    !member(value.paint, PAINT_IDS) || !member(value.decal, DECAL_IDS)) {
    throw new TypeError("A kart needs two different characters and valid body, wheel, glider, paint, and decal choices.");
  }
  return {
    characters: [value.characters[0], value.characters[1]], body: value.body, wheels: value.wheels,
    glider: value.glider, paint: value.paint, decal: value.decal,
  };
}
function validGameSettings(value: unknown): value is GameSettings {
  if (!isRecord(value) || !isRecord(value.buttons) || !isRecord(value.keys) || !validCalibration(value)) return false;
  const buttons = value.buttons;
  const keys = value.keys;
  return finite(value.master, 0, 1) && finite(value.music, 0, 1) && finite(value.effects, 0, 1) &&
    member(value.quality, ["low", "balanced", "high"]) && typeof value.reducedMotion === "boolean" &&
    typeof value.shake === "boolean" && typeof value.faceDrive === "boolean" &&
    GAME_BUTTON_ACTIONS.every(action => typeof buttons[action] === "number" && validButton(buttons[action])) &&
    GAME_KEY_ACTIONS.every(action => typeof keys[action] === "string" && validKey(keys[action])) &&
    new Set(GAME_BUTTON_ACTIONS.map(action => buttons[action])).size === GAME_BUTTON_ACTIONS.length &&
    new Set(GAME_KEY_ACTIONS.map(action => keys[action])).size === GAME_KEY_ACTIONS.length;
}
const profileId = (value: unknown): value is string => typeof value === "string" && /^local-[1-4]$/.test(value);
export function recordKey(profile: string, course: CourseId, version: string, speed: 50 | 100 | 150, mirror: boolean): string {
  return `${profile}:${course}:${version}:${speed}:${mirror ? "mirror" : "normal"}`;
}

export function freshGame(nickname = `Racer ${crypto.getRandomValues(new Uint16Array(1))[0].toString(36).toUpperCase()}`): GameSave {
  const presets: KartBuild[] = [
    DEFAULT_BUILD,
    { ...DEFAULT_BUILD, characters: ["pompa", "bront"], body: "gilt-trip", glider: "sunfan" },
    { ...DEFAULT_BUILD, characters: ["rivet", "pipvolt"], body: "slipstream", wheels: "button", glider: "crosskite" },
    { ...DEFAULT_BUILD, characters: ["bollo", "hunkle"], body: "air-pocket", wheels: "cushion", glider: "bellflower" },
  ];
  return {
    version: 2, settings: structuredClone(DEFAULT_GAME_SETTINGS),
    profiles: presets.map((build, index) => ({
      id: `local-${index + 1}`, name: index === 0 ? nickname : `Player ${index + 1}`,
      build: structuredClone(build), calibration: null,
    })),
    presets: [], records: [], medals: [], races: 0, wins: 0,
  };
}

function parseProfile(value: unknown): PlayerProfile {
  if (!isRecord(value) || !profileId(value.id) || !validNickname(value.name) ||
    !(value.calibration === null || validCalibration(value.calibration))) throw new TypeError("Invalid player profile.");
  return { id: value.id, name: value.name, build: parseBuild(value.build), calibration: value.calibration };
}
function parseRaceRecord(value: unknown): RaceRecord {
  if (!isRecord(value) || !profileId(value.profileId) || !member(value.courseId, COURSE_IDS) ||
    typeof value.courseVersion !== "string" || !/^[a-z0-9.-]{1,60}$/.test(value.courseVersion) ||
    (value.speedClass !== 50 && value.speedClass !== 100 && value.speedClass !== 150) ||
    typeof value.mirror !== "boolean" || !finite(value.time, 0.01, 86400) ||
    !finite(value.bestLap, 0.01, value.time) || !finite(value.date, 0, 1e14)) throw new TypeError("Invalid local race record.");
  const key = recordKey(value.profileId, value.courseId, value.courseVersion, value.speedClass, value.mirror);
  if (value.key !== key) throw new TypeError("Invalid local record identity.");
  return {
    key, profileId: value.profileId, courseId: value.courseId, courseVersion: value.courseVersion,
    speedClass: value.speedClass, mirror: value.mirror, time: value.time, bestLap: value.bestLap,
    date: value.date, build: parseBuild(value.build),
  };
}
function parseMedal(value: unknown): CupMedal {
  if (!isRecord(value) || !member(value.cup, ["town", "horizon", "tour"]) ||
    !member(value.medal, ["bronze", "silver", "gold"]) ||
    (value.speedClass !== 50 && value.speedClass !== 100 && value.speedClass !== 150) ||
    typeof value.mirror !== "boolean" || !finite(value.points, 0, 1000)) throw new TypeError("Invalid cup medal.");
  return { cup: value.cup, medal: value.medal, speedClass: value.speedClass, mirror: value.mirror, points: value.points };
}
export function parseGameSave(value: unknown): GameSave {
  if (!isRecord(value) || value.version !== 2 || !validGameSettings(value.settings) ||
    !Array.isArray(value.profiles) || value.profiles.length !== 4 ||
    !Array.isArray(value.presets) || value.presets.length > 24 ||
    !Array.isArray(value.records) || value.records.length > 144 ||
    !Array.isArray(value.medals) || value.medals.length > 18 ||
    !finite(value.races, 0, Number.MAX_SAFE_INTEGER) || !Number.isInteger(value.races) ||
    !finite(value.wins, 0, value.races) || !Number.isInteger(value.wins)) throw new TypeError("Unsupported saved game format.");
  const profiles = value.profiles.map(parseProfile);
  if (new Set(profiles.map(profile => profile.id)).size !== 4) throw new TypeError("Duplicate local profiles.");
  const records = value.records.map(parseRaceRecord);
  if (new Set(records.map(record => record.key)).size !== records.length) throw new TypeError("Duplicate local records.");
  return {
    version: 2, settings: structuredClone(value.settings), profiles,
    presets: value.presets.map(preset => {
      if (!isRecord(preset) || !validNickname(preset.name)) throw new TypeError("Invalid saved kart preset.");
      return { name: preset.name, build: parseBuild(preset.build) };
    }),
    records, medals: value.medals.map(parseMedal), races: value.races, wins: value.wins,
  };
}

export function loadGame(storage: Pick<Storage, "getItem">): LoadedGame {
  let raw: string | null;
  let old: string | null;
  try {
    raw = storage.getItem(GAME_STORAGE_KEY);
    old = raw ? null : storage.getItem(STUDY_STORAGE_KEY);
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
    return { data: freshGame(), warning: "Browser storage is unavailable. This visit works, but progress cannot be saved.", canWrite: false };
  }
  if (raw) {
    try {
      if (raw.length > 500_000) throw new TypeError("Saved game exceeds its size limit.");
      return { data: parseGameSave(JSON.parse(raw)), warning: null, canWrite: true };
    } catch (error) {
      if (!(error instanceof SyntaxError) && !(error instanceof TypeError)) throw error;
      return { data: freshGame(), warning: "Saved data could not be read and has not been overwritten. You can play temporarily, or reset this game's save in Settings.", canWrite: false };
    }
  }
  const data = freshGame();
  if (!old) return { data, warning: null, canWrite: true };
  const study = loadSave({ getItem: () => old });
  if (study.warning && /unsupported|could not be read/.test(study.warning)) {
    return { data, warning: "The old study save is unreadable and was left untouched. New game progress uses a separate save.", canWrite: true };
  }
  data.settings = {
    ...data.settings, ...study.data.settings,
    keys: { ...data.settings.keys, ...study.data.settings.keys },
    buttons: { ...data.settings.buttons, ...study.data.settings.buttons },
  };
  // Keep custom bindings, but allocate free buttons/keys for newly introduced actions.
  const usedButtons = new Set<number>();
  const buttonOrder = [...GAME_BUTTON_ACTIONS].sort((a, b) => Number(Object.hasOwn(DEFAULT_SETTINGS.buttons, b)) - Number(Object.hasOwn(DEFAULT_SETTINGS.buttons, a)));
  for (const action of buttonOrder) {
    let button = data.settings.buttons[action];
    if (action === "recover" && button === 2) button = 11;
    if (!validButton(button) || usedButtons.has(button)) {
      button = Array.from({ length: 32 }, (_, i) => i).find(candidate => validButton(candidate) && !usedButtons.has(candidate))!;
    }
    data.settings.buttons[action] = button;
    usedButtons.add(button);
  }
  const usedKeys = new Set<string>();
  const keyOrder = [...GAME_KEY_ACTIONS].sort((a, b) => Number(Object.hasOwn(DEFAULT_SETTINGS.keys, b)) - Number(Object.hasOwn(DEFAULT_SETTINGS.keys, a)));
  for (const action of keyOrder) {
    let key = data.settings.keys[action];
    if (usedKeys.has(key)) key = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(letter => `Key${letter}`).find(candidate => !usedKeys.has(candidate))!;
    data.settings.keys[action] = key;
    usedKeys.add(key);
  }
  return { data, warning: "Study settings imported. New race records start fresh; the old study save is kept. Review the new item and tandem bindings in Controls.", canWrite: true };
}

export function saveGame(storage: Pick<Storage, "setItem">, value: GameSave): string | null {
  const data = parseGameSave(value);
  try {
    storage.setItem(GAME_STORAGE_KEY, JSON.stringify(data));
    return null;
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
    return "Progress could not be saved. Allow local storage or free some space; your current race can continue.";
  }
}

export function keepRecord(save: GameSave, result: RaceRecord): { save: GameSave; improved: boolean } {
  const incoming = parseRaceRecord(result);
  const previous = save.records.find(record => record.key === incoming.key);
  if (previous && previous.time <= incoming.time) {
    return {
      save: incoming.bestLap < previous.bestLap
        ? { ...save, records: save.records.map(record => record.key === incoming.key ? { ...record, bestLap: incoming.bestLap } : record) }
        : save,
      improved: false,
    };
  }
  return {
    save: {
      ...save,
      records: [...save.records.filter(record => record.key !== incoming.key), { ...incoming, bestLap: Math.min(incoming.bestLap, previous?.bestLap ?? Infinity) }]
        .sort((a, b) => b.date - a.date).slice(0, 144),
    },
    improved: true,
  };
}

export function keepMedal(save: GameSave, medal: CupMedal): GameSave {
  const incoming = parseMedal(medal);
  const matches = (other: CupMedal) => other.cup === incoming.cup && other.speedClass === incoming.speedClass && other.mirror === incoming.mirror;
  const previous = save.medals.find(matches);
  const rank = { bronze: 1, silver: 2, gold: 3 };
  if (previous && rank[previous.medal] >= rank[incoming.medal] && previous.points >= incoming.points) return save;
  const best = previous ? {
    ...incoming, medal: rank[previous.medal] > rank[incoming.medal] ? previous.medal : incoming.medal,
    points: Math.max(previous.points, incoming.points),
  } : incoming;
  return { ...save, medals: [...save.medals.filter(medal => !matches(medal)), best].slice(-18) };
}
