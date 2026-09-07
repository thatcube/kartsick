import type { DriverInput } from "@kartsick/simulation";
export * from "./rooms.ts";
export * from "./race.ts";
export * from "./fragments.ts";

export const PROTOCOL_VERSION = 1;
export const ROOM_LIMITS = Object.freeze({ humans: 16, karts: 8, localHumans: 4, reconnectSeconds: 60 });
export const RELAY_ACTIVATION = "blocked-pending-enforceable-total-budget" as const;

export interface InputPacket {
  version: typeof PROTOCOL_VERSION;
  type: "input";
  epoch: number;
  sequence: number;
  tick: number;
  seat: number;
  input: DriverInput;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function integer(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
}
function analog(value: unknown, min: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= 1;
}

export function isDriverInput(value: unknown): value is DriverInput {
  return record(value) && Object.keys(value).length === 7 &&
    analog(value.throttle, 0) && analog(value.brake, 0) && analog(value.steer, -1) &&
    analog(value.pitch, -1) && typeof value.drift === "boolean" &&
    typeof value.swap === "boolean" && typeof value.recover === "boolean";
}

export function parseInputPacket(value: unknown): InputPacket {
  if (!record(value) || Object.keys(value).length !== 7 || value.version !== PROTOCOL_VERSION ||
    value.type !== "input" || !integer(value.epoch, 0xffffffff) ||
    !integer(value.sequence, 0xffffffff) || !integer(value.tick, Number.MAX_SAFE_INTEGER) ||
    !integer(value.seat, ROOM_LIMITS.humans - 1) || !isDriverInput(value.input)) {
    throw new TypeError("Invalid or unsupported input packet.");
  }
  return {
    version: PROTOCOL_VERSION, type: "input", epoch: value.epoch,
    sequence: value.sequence, tick: value.tick, seat: value.seat, input: { ...value.input },
  };
}

export function sequenceIsNewer(sequence: number, acknowledged: number): boolean {
  const delta = (sequence - acknowledged) >>> 0;
  return delta > 0 && delta < 0x80000000;
}
