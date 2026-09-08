import { ITEM_IDS } from "@kartsick/content";
import type { ItemId } from "@kartsick/content";
import { STEP } from "./physics";
import { RACE_LIMITS } from "./race";
import type { RaceEvent } from "./race";

type Detail = "effectId" | "targetId" | "item" | "value";
interface EventRule {
  required: readonly Detail[];
  optional?: readonly Detail[];
  global?: boolean;
  target?: "kart" | "reference";
  value?: "tier" | "seconds" | "bumpers" | "slide" | "takeover" | "roulette";
}

const simple: EventRule = { required: [] };
const effect: EventRule = { required: ["effectId", "item"] };
const rules: Record<RaceEvent["type"], EventRule> = {
  start: { required: [], global: true },
  "start-boost": simple,
  "double-start": simple,
  charge: { required: ["value"], value: "tier" },
  boost: { required: ["effectId"] },
  launch: simple,
  land: simple,
  recover: simple,
  swap: simple,
  collision: { required: [], optional: ["targetId"], target: "kart" },
  lap: { required: ["value"], value: "seconds" },
  finish: { required: ["value"], value: "seconds" },
  "race-finished": { required: [], global: true },
  pickup: { ...effect, optional: ["value"], value: "roulette" },
  "item-ready": effect,
  "item-used": effect,
  spawn: effect,
  expire: effect,
  hit: { ...effect, optional: ["targetId"], target: "kart" },
  blocked: { ...effect, optional: ["targetId"], target: "reference" },
  reflect: { required: ["effectId", "item", "value"], value: "bumpers" },
  deflect: effect,
  steal: { required: ["effectId", "targetId", "item"], target: "kart" },
  pass: { required: ["effectId"] },
  slide: { required: ["effectId", "value"], value: "slide" },
  takeover: { required: ["value"], value: "takeover" },
};
const fields = ["type", "tick", "kartId", "effectId", "targetId", "item", "value"] as const;
const details: readonly Detail[] = ["effectId", "targetId", "item", "value"];

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}
function kartId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value) && !/^e\d+$/.test(value);
}
function effectId(value: unknown): value is string {
  return typeof value === "string" && /^e[1-9]\d{0,7}$/.test(value) &&
    Number(value.slice(1)) < RACE_LIMITS.maximumId;
}
function validValue(value: unknown, kind: EventRule["value"]): value is number {
  switch (kind) {
    case "tier": return integer(value, 1, 3);
    case "seconds":
      // Elapsed time accumulates floating-point fixed steps, not integer milliseconds.
      return typeof value === "number" && Number.isFinite(value) && value >= 0 &&
        value <= RACE_LIMITS.maximumTicks * STEP + STEP;
    case "bumpers": return integer(value, 0, 3);
    case "slide": return value === -1 || value === 1;
    case "takeover": return value === 0 || value === 1;
    case "roulette": return value === 1.6;
    default: return false;
  }
}

/** Validates event data, not live reference membership, ordering or authority epochs. */
export function parseRaceEvent(value: unknown): RaceEvent | null {
  try {
    if (value === null || typeof value !== "object") return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length < 3 || ownKeys.length > fields.length) return null;

    const data: Record<string, unknown> = Object.create(null);
    for (const key of ownKeys) {
      if (typeof key !== "string" || !fields.includes(key as typeof fields[number])) return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      // Network JSON has own enumerable data fields; do not execute getters while decoding.
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return null;
      data[key] = descriptor.value;
    }
    if (typeof data.type !== "string" || !Object.hasOwn(rules, data.type)) return null;
    const type = data.type as RaceEvent["type"];
    const rule = rules[type];
    if (!integer(data.tick, 0, RACE_LIMITS.maximumTicks) ||
      !(rule.global ? data.kartId === "" : kartId(data.kartId))) return null;
    if (!rule.required.every(key => Object.hasOwn(data, key))) return null;
    for (const key of details) {
      if (Object.hasOwn(data, key) && !rule.required.includes(key) && !rule.optional?.includes(key)) return null;
    }
    if (Object.hasOwn(data, "effectId") && !effectId(data.effectId)) return null;
    if (Object.hasOwn(data, "targetId") &&
      !(kartId(data.targetId) || rule.target === "reference" && effectId(data.targetId))) return null;
    if (Object.hasOwn(data, "item") && !ITEM_IDS.includes(data.item as ItemId)) return null;
    if (Object.hasOwn(data, "value") && !validValue(data.value, rule.value)) return null;

    const result: RaceEvent = { type, tick: data.tick, kartId: data.kartId as string };
    if (Object.hasOwn(data, "effectId")) result.effectId = data.effectId as string;
    if (Object.hasOwn(data, "targetId")) result.targetId = data.targetId as string;
    if (Object.hasOwn(data, "item")) result.item = data.item as ItemId;
    if (Object.hasOwn(data, "value")) result.value = data.value as number;
    return result;
  } catch {
    return null;
  }
}

export function decodeRaceEvent(value: unknown): RaceEvent {
  const event = parseRaceEvent(value);
  if (!event) throw new TypeError("Invalid race event.");
  return event;
}
