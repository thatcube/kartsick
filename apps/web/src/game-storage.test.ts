import { describe, expect, it } from "vitest";
import { DEFAULT_BUILD, STUDY_VERSION } from "@kartsick/content";
import { createKart } from "@kartsick/simulation";
import { DEFAULT_GAME_SETTINGS, buttonName, controllerFamily, readKeyboard, readPad, rebindButton, rebindKey } from "./game-controls";
import { GAME_STORAGE_KEY, freshGame, keepMedal, keepRecord, loadGame, parseBuild, parseGameSave, recordKey, saveGame } from "./game-storage";
import type { RaceRecord } from "./game-storage";
import { freshSave, STORAGE_KEY } from "./storage";
import { GHOST_STORAGE_KEY, GhostRecorder, ghostPose, loadGhosts, parseGhost, saveGhost } from "./ghosts";

describe("full game controls", () => {
  it("keeps analog range and does not turn the driver's brake into a rear attack", () => {
    const pad = { axes: [0.57, 0.8], buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })) };
    pad.buttons[1].value = 1;
    expect(readPad(pad, DEFAULT_GAME_SETTINGS, DEFAULT_GAME_SETTINGS, "solo").slide).toBe(0);
    expect(readPad(pad, DEFAULT_GAME_SETTINGS, DEFAULT_GAME_SETTINGS, "rear").slide).toBe(1);
    expect(readPad(pad, DEFAULT_GAME_SETTINGS, DEFAULT_GAME_SETTINGS, "driver").brake).toBe(1);
    expect(readPad(pad, DEFAULT_GAME_SETTINGS, DEFAULT_GAME_SETTINGS, "driver").steer).toBeCloseTo(0.5);
    expect(readPad(pad, DEFAULT_GAME_SETTINGS, DEFAULT_GAME_SETTINGS, "driver").throwDirection).toBe(-1);
  });
  it("labels mainstream controllers and respects Nintendo face-button positions", () => {
    expect(controllerFamily("Wireless Controller Vendor: 054c")).toBe("playstation");
    expect(controllerFamily("Xbox Wireless Controller")).toBe("xbox");
    expect(controllerFamily("Nintendo Switch Pro")).toBe("switch");
    expect(buttonName(0, "switch")).toBe("B");
    expect(buttonName(1, "switch")).toBe("A");
    expect(buttonName(4, "playstation")).toBe("L1");
  });
  it("swaps conflicting bindings and reserves system buttons", () => {
    const key = rebindKey(DEFAULT_GAME_SETTINGS, "useItem", "KeyW");
    expect(key.keys.useItem).toBe("KeyW");
    expect(key.keys.throttle).toBe("KeyE");
    const button = rebindButton(DEFAULT_GAME_SETTINGS, "useItem", 5);
    expect(button.buttons.drift).toBe(4);
    expect(() => rebindButton(DEFAULT_GAME_SETTINGS, "recover", 9)).toThrow("reserved");
    expect(() => rebindKey(DEFAULT_GAME_SETTINGS, "recover", "Escape")).toThrow("reserved");
  });
  it("keeps keyboard driving manual and rear attacks role-specific", () => {
    expect(readKeyboard(new Set(), DEFAULT_GAME_SETTINGS, "solo").throttle).toBe(0);
    expect(readKeyboard(new Set(["KeyZ"]), DEFAULT_GAME_SETTINGS, "solo").slide).toBe(0);
    expect(readKeyboard(new Set(["KeyZ", "KeyE"]), DEFAULT_GAME_SETTINGS, "rear")).toMatchObject({ slide: -1, useItem: true });
    expect(readKeyboard(new Set(["ShiftLeft"]), DEFAULT_GAME_SETTINGS, "solo").throwDirection).toBe(-1);
  });
  it("does not combine a remapped item with the optional face-button throttle", () => {
    const settings = rebindButton(DEFAULT_GAME_SETTINGS, "useItem", 0);
    const pad = { axes: [0, 0], buttons: Array.from({ length: 17 }, (_, index) => ({ value: Number(index === 0), pressed: index === 0, touched: index === 0 })) };
    expect(readPad(pad, settings, settings, "solo")).toMatchObject({ useItem: true, throttle: 0 });
  });
});

describe("versioned game progression", () => {
  it("round-trips all four profiles without any locked-content fields", () => {
    const game = freshGame("Test driver");
    expect(parseGameSave(JSON.parse(JSON.stringify(game)))).toEqual(game);
    expect(game.profiles).toHaveLength(4);
    expect(Object.keys(game)).not.toContain("unlocked");
  });
  it("rejects duplicate characters, profiles and reserved bindings", () => {
    expect(() => parseBuild({ ...DEFAULT_BUILD, characters: ["clutch", "clutch"] })).toThrow();
    const game = freshGame("Test driver");
    game.profiles[1].id = game.profiles[0].id;
    expect(() => parseGameSave(game)).toThrow("Duplicate");
    game.profiles[1].id = "local-2";
    game.settings.buttons.recover = 9;
    expect(() => parseGameSave(game)).toThrow();
  });
  it("migrates study settings without deleting the old save or importing incomparable times", () => {
    const study = freshSave();
    study.settings.master = 0.2;
    study.bestLap = 12;
    const loaded = loadGame({ getItem: key => key === STORAGE_KEY ? JSON.stringify(study) : null });
    expect(loaded.data.settings.master).toBe(0.2);
    expect(loaded.data.settings.buttons.recover).toBe(11);
    expect(loaded.data.records).toEqual([]);
    expect(parseGameSave(loaded.data)).toEqual(loaded.data);
    expect(loaded.warning).toContain("Study settings imported");
  });
  it("does not allow automatic writes over unreadable saved data", () => {
    expect(loadGame({ getItem: key => key === GAME_STORAGE_KEY ? "broken" : null }).canWrite).toBe(false);
    expect(saveGame({ setItem: () => { throw new DOMException("quota", "QuotaExceededError"); } }, freshGame())).toContain("could not be saved");
    expect(() => saveGame({ setItem: () => { throw new Error("bug"); } }, freshGame())).toThrow("bug");
  });
  it("preserves legacy custom actions before allocating new item bindings", () => {
    const study = freshSave();
    study.settings.buttons.swap = 4;
    study.settings.keys.swap = "KeyE";
    study.settings.keys.recover = "KeyQ";
    const loaded = loadGame({ getItem: key => key === STORAGE_KEY ? JSON.stringify(study) : null });
    expect(loaded.data.settings.buttons.swap).toBe(4);
    expect(loaded.data.settings.buttons.useItem).not.toBe(4);
    expect(loaded.data.settings.keys.swap).toBe("KeyE");
    expect(loaded.data.settings.keys.recover).toBe("KeyQ");
    expect(loaded.data.settings.keys.useItem).not.toBe("KeyE");
    expect(loaded.data.settings.keys.passItem).not.toBe("KeyQ");
    expect(parseGameSave(loaded.data)).toEqual(loaded.data);
  });
  it("keeps best total and best lap independently", () => {
    const game = freshGame();
    const record: RaceRecord = {
      key: recordKey("local-1", "butterbell", STUDY_VERSION, 100, false), profileId: "local-1",
      courseId: "butterbell", courseVersion: STUDY_VERSION, speedClass: 100, mirror: false,
      build: DEFAULT_BUILD, time: 100, bestLap: 31, date: 100,
    };
    const first = keepRecord(game, record);
    const lap = keepRecord(first.save, { ...record, time: 110, bestLap: 29 });
    expect(lap.improved).toBe(false);
    expect(lap.save.records[0]).toMatchObject({ time: 100, bestLap: 29 });
    expect(keepRecord(lap.save, { ...record, time: 98 }).save.records[0]).toMatchObject({ time: 98, bestLap: 29 });
  });
  it("never downgrades a medal when recording a different points total", () => {
    const gold = keepMedal(freshGame(), { cup: "town", speedClass: 100, mirror: false, medal: "gold", points: 25 });
    expect(keepMedal(gold, { cup: "town", speedClass: 100, mirror: false, medal: "bronze", points: 27 }).medals[0].medal).toBe("gold");
  });
});

describe("bounded local ghosts", () => {
  function run() {
    const recorder = new GhostRecorder();
    const kart = createKart();
    for (let tick = 0; tick <= 120; tick++) {
      kart.tick = tick;
      kart.x = tick / 6;
      kart.yaw = tick < 60 ? 3.1 : -3.1;
      recorder.sample(kart);
    }
    return recorder.finish(recordKey("local-1", "butterbell", STUDY_VERSION, 100, false), DEFAULT_BUILD, 2)!;
  }
  it("records poses at ten hertz and interpolates across the yaw seam", () => {
    const ghost = run();
    expect(ghost.frames).toHaveLength(21);
    expect(parseGhost(JSON.parse(JSON.stringify(ghost)))).toEqual(ghost);
    expect(ghostPose(ghost, 0.95)?.x).toBeCloseTo(9.5);
    expect(Math.abs(ghostPose(ghost, 0.95)!.yaw)).toBeGreaterThan(3);
    expect(ghostPose(ghost, 3)).toBeNull();
  });
  it("rejects invalid frames and keeps the existing cache on quota failure", () => {
    const ghost = run();
    expect(() => parseGhost({ ...ghost, frames: [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]] })).toThrow();
    const previous = JSON.stringify([ghost]);
    const storage = {
      getItem: (key: string) => key === GHOST_STORAGE_KEY ? previous : null,
      setItem: () => { throw new DOMException("quota", "QuotaExceededError"); },
    };
    expect(saveGhost(storage, ghost)).toContain("could not store");
    expect(loadGhosts(storage).ghosts[0]).toEqual(ghost);
  });
});
