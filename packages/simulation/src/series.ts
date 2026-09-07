import { CUPS } from "@kartsick/content";
import type { CourseId } from "@kartsick/content";
import { RACE_POINTS, parseRaceState } from "./race";
import type { RaceResult, RaceState } from "./race";

export type SeriesId = typeof CUPS[number]["id"];
export interface SeriesRound { courseId: CourseId; results: RaceResult[] }
export interface SeriesProgress { version: 1; cup: SeriesId; rounds: SeriesRound[] }
export interface SeriesStanding {
  id: string; name: string; position: number; points: number; wins: number; finishes: number;
  time: number; places: (number | null)[];
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown, maximum: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum;
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);

export function createSeries(cup: SeriesId): SeriesProgress {
  if (!CUPS.some(series => series.id === cup)) throw new RangeError("Unknown circuit.");
  return { version: 1, cup, rounds: [] };
}
export function nextSeriesCourse(series: SeriesProgress): CourseId | null {
  const definition = CUPS.find(cup => cup.id === series.cup);
  if (!definition) throw new RangeError("Unknown circuit.");
  return definition.courses[series.rounds.length] ?? null;
}
export function parseSeries(value: unknown): SeriesProgress | null {
  if (!record(value) || !exact(value, ["version", "cup", "rounds"]) || value.version !== 1) return null;
  const definition = CUPS.find(cup => cup.id === value.cup);
  if (!definition || !Array.isArray(value.rounds) || value.rounds.length > definition.courses.length) return null;
  const rounds: SeriesRound[] = [];
  const allIds = new Set<string>();
  for (const [index, round] of value.rounds.entries()) {
    if (!record(round) || !exact(round, ["courseId", "results"]) || round.courseId !== definition.courses[index] ||
      !Array.isArray(round.results) || round.results.length < 1 || round.results.length > 8) return null;
    const ids = new Set<string>(), places = new Set<number>();
    const results: RaceResult[] = [];
    for (const entry of round.results) {
      if (!record(entry) || !exact(entry, ["id", "name", "position", "finished", "disconnected", "time", "progress", "points"]) ||
        !id(entry.id) || ids.has(entry.id) || typeof entry.name !== "string" || !entry.name.trim() || entry.name.length > 32 ||
        !finite(entry.position, round.results.length) || !Number.isInteger(entry.position) || entry.position < 1 || places.has(entry.position) ||
        typeof entry.finished !== "boolean" || typeof entry.disconnected !== "boolean" ||
        !(entry.time === null || finite(entry.time, 1800)) || entry.finished !== (entry.time !== null) ||
        !finite(entry.progress, 256) || entry.points !== RACE_POINTS[entry.position - 1]) return null;
      ids.add(entry.id);
      allIds.add(entry.id);
      places.add(entry.position);
      results.push({
        id: entry.id, name: entry.name, position: entry.position, finished: entry.finished, disconnected: entry.disconnected,
        time: entry.time, progress: entry.progress, points: RACE_POINTS[entry.position - 1],
      });
    }
    rounds.push({ courseId: definition.courses[index], results });
  }
  if (allIds.size > 8) return null;
  return { version: 1, cup: definition.id, rounds };
}
export function appendSeriesRound(series: SeriesProgress, race: RaceState): SeriesProgress {
  const current = parseSeries(series), completed = parseRaceState(race);
  if (!current || !completed || completed.phase !== "finished" || completed.options.mode !== "race" ||
    completed.options.courseId !== nextSeriesCourse(current)) throw new RangeError("Only the next circuit course's completed race can be recorded.");
  const result = parseSeries({
    ...current, rounds: [...current.rounds, { courseId: completed.options.courseId, results: completed.results }],
  });
  if (!result) throw new RangeError("Circuit results exceeded the bounded roster.");
  return result;
}
export function seriesStandings(series: SeriesProgress): SeriesStanding[] {
  const current = parseSeries(series);
  if (!current) throw new RangeError("Invalid circuit progress.");
  const entries = new Map<string, SeriesStanding>();
  for (const [round, result] of current.rounds.entries()) for (const kart of result.results) {
    const entry = entries.get(kart.id) ?? {
      id: kart.id, name: kart.name, position: 0, points: 0, wins: 0, finishes: 0, time: 0,
      places: Array.from({ length: current.rounds.length }, () => null),
    };
    entry.name = kart.name;
    entry.points += kart.points;
    entry.wins += Number(kart.position === 1 && kart.finished);
    entry.finishes += Number(kart.finished);
    entry.time += kart.time ?? 0;
    entry.places[round] = kart.position;
    entries.set(kart.id, entry);
  }
  return [...entries.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || b.finishes - a.finishes ||
    a.time - b.time || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((entry, index) => ({ ...entry, position: index + 1 }));
}
export function seriesMedal(series: SeriesProgress, localKarts: ReadonlySet<string>): { medal: "gold" | "silver" | "bronze"; points: number } | null {
  if (nextSeriesCourse(series) !== null) return null;
  const own = seriesStandings(series).find(entry => localKarts.has(entry.id) && entry.position <= 3 && entry.finishes === series.rounds.length);
  if (!own) return null;
  return { medal: own.position === 1 ? "gold" : own.position === 2 ? "silver" : "bronze", points: own.points };
}
