import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, freshSave, loadSave, persistSave } from "./storage";
import { calibrateAxis, gamepadHasInput } from "./input";

describe("local study saves", () => {
  it("loads missing data as a genuinely new profile", () => {
    expect(loadSave({ getItem: () => null }).data).toEqual(freshSave());
  });
  it("reports corruption instead of silently losing a record", () => {
    expect(loadSave({ getItem: () => "invalid json" }).warning).toContain("could not be read");
  });
  it("rejects invalid calibration and keeps the source untouched", () => {
    const invalid = freshSave();
    invalid.settings.deadzone = 2;
    expect(loadSave({ getItem: () => JSON.stringify(invalid) }).warning).toContain("unsupported format");
  });
  it("preserves settings but invalidates incomparable old-course records", () => {
    const old = { ...freshSave(), courseVersion: "old-layout", bestLap: 45 };
    const loaded = loadSave({ getItem: () => JSON.stringify(old) });
    expect(loaded.data.bestLap).toBeNull();
    expect(loaded.data.settings).toEqual(DEFAULT_SETTINGS);
    expect(loaded.warning).toContain("layout changed");
  });
  it("surfaces quota failures and does not swallow programmer errors", () => {
    expect(persistSave({ setItem: () => { throw new DOMException("Full", "QuotaExceededError"); } }, freshSave())).toContain("could not save");
    expect(() => persistSave({ setItem: () => { throw new Error("unexpected"); } }, freshSave())).toThrow("unexpected");
  });
});
describe("analog calibration", () => {
  it("recognizes an analog trigger before its digital pressed threshold", () => {
    expect(gamepadHasInput({ axes: [0, 0], buttons: [{ value: 0.3, pressed: false, touched: true }] }, 0.14)).toBe(true);
    expect(gamepadHasInput({ axes: [0.03, 0], buttons: [{ value: 0, pressed: false, touched: false }] }, 0.14)).toBe(false);
  });
  it("suppresses noise, retains the full range, and rejects NaN", () => {
    expect(calibrateAxis(0.08, 0.14)).toBe(0);
    expect(calibrateAxis(-1, 0.14)).toBe(-1);
    expect(calibrateAxis(1, 0.14)).toBe(1);
    expect(calibrateAxis(0.57, 0.14)).toBeCloseTo(0.5);
    expect(calibrateAxis(NaN, 0.14)).toBe(0);
  });
});
