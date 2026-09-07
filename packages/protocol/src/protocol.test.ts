import { describe, expect, it } from "vitest";
import { NEUTRAL } from "@kartsick/simulation";
import { PROTOCOL_VERSION, RELAY_ACTIVATION, parseInputPacket, sequenceIsNewer } from "./index";

const packet = () => ({ version: PROTOCOL_VERSION, type: "input", epoch: 2, sequence: 15, tick: 65, seat: 0, input: { ...NEUTRAL } });
describe("versioned input boundary", () => {
  it("copies accepted inputs rather than retaining mutable network objects", () => {
    const source = packet();
    const parsed = parseInputPacket(source);
    source.input.steer = 1;
    expect(parsed.input.steer).toBe(0);
  });
  it.each([
    { version: 2 }, { seat: 16 }, { epoch: -1 }, { sequence: 0.1 }, { tick: Infinity },
    { extra: "unbounded" }, { input: { ...NEUTRAL, steer: NaN } },
    { input: { ...NEUTRAL, throttle: 4 } }, { input: { ...NEUTRAL, surprise: true } },
  ])("rejects malformed input: %j", change => {
    expect(() => parseInputPacket({ ...packet(), ...change })).toThrow(TypeError);
  });
  it("handles duplicate, old, and wrapping sequence numbers", () => {
    expect(sequenceIsNewer(15, 15)).toBe(false);
    expect(sequenceIsNewer(14, 15)).toBe(false);
    expect(sequenceIsNewer(16, 15)).toBe(true);
    expect(sequenceIsNewer(0, 0xffffffff)).toBe(true);
    expect(sequenceIsNewer(0xffffffff, 0)).toBe(false);
  });
  it("does not activate billable relay as part of an offline driving study", () => {
    expect(RELAY_ACTIVATION).toBe("blocked-pending-enforceable-total-budget");
  });
});
