import { describe, expect, it } from "vitest";
import { NEUTRAL_PLAYER } from "@kartsick/simulation";
import { freshGame } from "./game-storage";
import { LocalRaceSession, localEntries, localViews } from "./local-race";
import type { LocalPlayer } from "./local-input";
import { splitViewports } from "./ui/game-hud";

const profiles = freshGame("One").profiles;
const players: LocalPlayer[] = profiles.map(profile => ({ id: profile.id, name: profile.name, device: { kind: "unassigned" }, connected: true, calibration: null }));
describe("local kart seating and views", () => {
  it("renders one view per kart, not one per tandem human", () => {
    const entries = localEntries(profiles, players, { "local-1": 0, "local-2": 0, "local-3": 1, "local-4": 1 });
    expect(entries).toHaveLength(2);
    expect(entries[0].players).toEqual(["local-1", "local-2"]);
    expect(localViews(entries, new Set(players.map(player => player.id)))).toHaveLength(2);
  });
  it("supports four independent local karts and rejects a third human on one kart", () => {
    const entries = localEntries(profiles, players, { "local-1": 0, "local-2": 1, "local-3": 2, "local-4": 3 });
    expect(localViews(entries, new Set(players.map(player => player.id)))).toHaveLength(4);
    expect(() => localEntries(profiles, players, { "local-1": 0, "local-2": 0, "local-3": 0, "local-4": 1 })).toThrow("two human");
    expect(() => localEntries(profiles, players, { "local-1": -1 })).toThrow();
  });
  it("preserves independent saved builds and selects the first occupant's kart", () => {
    const entries = localEntries(profiles, players.slice(0, 2), { "local-1": 0, "local-2": 0 });
    expect(entries[0].build).toEqual(profiles[0].build);
    entries[0].build.characters.reverse();
    expect(profiles[0].build.characters).toEqual(["clutch", "bramble"]);
  });
  it("accepts two maximum-length nicknames without exceeding the simulation's kart-name limit", () => {
    const pair = players.slice(0, 2).map((player, index) => ({ ...player, name: (index ? "B" : "A").repeat(24) }));
    const entries = localEntries(profiles, pair, { "local-1": 0, "local-2": 0 });
    expect(entries[0].name).toHaveLength(32);
    expect(() => new LocalRaceSession({
      courseId: "butterbell", mode: "race", speedClass: 100, mirror: false, bots: false, difficulty: "normal", seed: 1,
    }, entries)).not.toThrow();
  });
  it("keeps normalized viewports disjoint and reserves a quadrant for the three-kart field map", () => {
    for (let count = 1; count <= 4; count++) {
      const views = splitViewports(count);
      expect(views.reduce((sum, view) => sum + view.width * view.height, 0)).toBe(count === 3 ? 0.75 : 1);
      for (let i = 0; i < views.length; i++) for (let j = i + 1; j < views.length; j++) {
        const a = views[i], b = views[j];
        expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
      }
    }
  });
});

describe("fixed-step browser race session", () => {
  it("runs the real countdown and retains neutral manual control without an AI takeover", () => {
    const entries = localEntries(profiles, players.slice(0, 1), { "local-1": 0 });
    const session = new LocalRaceSession({ courseId: "butterbell", mode: "race", speedClass: 100, mirror: false, bots: false, difficulty: "normal", seed: 8 }, entries);
    for (let tick = 0; tick < 300; tick++) session.advance(1 / 60, { "local-1": { ...NEUTRAL_PLAYER } });
    expect(session.race.phase).toBe("racing");
    expect(session.race.karts[0].state.speed).toBe(0);
    expect(session.race.karts[0].ai).toBe(false);
    const tick = session.race.tick;
    session.resetClock();
    expect(session.paused().race.tick).toBe(tick);
    expect(session.paused().events).toEqual([]);
  });
});
