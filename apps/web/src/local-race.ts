import { FixedClock, copyKart, createRace, stepRace } from "@kartsick/simulation";
import type { KartState, PlayerInput, RaceEntry, RaceEvent, RaceOptions, RaceState } from "@kartsick/simulation";
import type { PlayerProfile } from "./game-storage";
import type { LocalPlayer } from "./local-input";
import { splitViewports } from "./ui/game-hud";
import type { HudView } from "./ui/game-hud";

export type KartAssignments = Readonly<Record<string, number>>;

export function localEntries(profiles: readonly PlayerProfile[], players: readonly LocalPlayer[], assignments: KartAssignments): RaceEntry[] {
  if (players.length < 1 || players.length > 4 || new Set(players.map(player => player.id)).size !== players.length) throw new RangeError("One to four distinct local players are supported.");
  const groups = new Map<number, LocalPlayer[]>();
  for (const player of players) {
    const number = assignments[player.id];
    if (!Number.isInteger(number) || number < 0 || number > 3) throw new RangeError("Choose a valid local kart.");
    const group = groups.get(number) ?? [];
    if (group.length >= 2) throw new RangeError("Each kart has two human seats.");
    group.push(player);
    groups.set(number, group);
  }
  return [...groups].sort(([a], [b]) => a - b).map(([number, group]) => {
    const profile = profiles.find(profile => profile.id === group[0].id);
    if (!profile) throw new RangeError("The local kart's profile is missing.");
    return {
      id: `local-kart-${number + 1}`, name: group.map(player => player.name).join(" & ").slice(0, 32),
      build: structuredClone(profile.build), players: [group[0].id, group[1]?.id ?? null],
    };
  });
}

export function localViews(entries: readonly RaceEntry[], localIds: ReadonlySet<string>): HudView[] {
  const own = entries.filter(entry => entry.players.some(id => id !== null && localIds.has(id)));
  const targets = own.length ? own : entries.slice(0, 1);
  if (!targets.length) return [];
  const rectangles = splitViewports(targets.length);
  return targets.map((entry, index) => ({ id: entry.id, label: own.length ? entry.name : `Watching ${entry.name}`, viewport: rectangles[index] }));
}

export interface SessionFrame {
  race: RaceState;
  previous: ReadonlyMap<string, KartState>;
  alpha: number;
  events: RaceEvent[];
  remote?: ReadonlyMap<string, { previous: KartState; state: KartState; alpha: number }>;
}

export class LocalRaceSession {
  readonly race: RaceState;
  private readonly clock = new FixedClock();
  private readonly previous = new Map<string, KartState>();

  constructor(options: RaceOptions, entries: readonly RaceEntry[]) {
    this.race = createRace(options, entries);
    this.remember();
  }

  get droppedSeconds(): number { return this.clock.droppedSeconds; }
  get finished(): boolean { return this.race.phase === "finished"; }
  resetClock(): void { this.clock.reset(); this.remember(); }
  private remember(): void {
    this.previous.clear();
    for (const kart of this.race.karts) this.previous.set(kart.id, copyKart(kart.state));
  }

  advance(elapsed: number, inputs: Readonly<Record<string, PlayerInput>>, onStep?: (race: RaceState) => void): SessionFrame {
    const events: RaceEvent[] = [];
    const alpha = this.clock.advance(elapsed, () => {
      if (this.race.phase === "finished") return;
      this.remember();
      events.push(...stepRace(this.race, inputs));
      for (const kart of this.race.karts) {
        const previous = this.previous.get(kart.id);
        if (previous && (kart.state.recovery > previous.recovery || Math.hypot(kart.state.x - previous.x, kart.state.z - previous.z) > 35)) {
          this.previous.set(kart.id, copyKart(kart.state));
        }
      }
      onStep?.(this.race);
    });
    return { race: this.race, previous: this.previous, alpha, events };
  }

  paused(): SessionFrame {
    return { race: this.race, previous: this.previous, alpha: 1, events: [] };
  }
}
