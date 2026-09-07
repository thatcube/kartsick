import type { CourseId } from "../../content/src/catalog-types.ts";
import type { RaceResult } from "./race.ts";

// Wire-safe rules: parity with the live course registry and simulation scoring is tested.
export const SERIES_COURSES = {
  town: ["butterbell", "escaluna", "tiltglass"],
  horizon: ["copperwhistle", "afterglow", "lastlight"],
  tour: ["butterbell", "escaluna", "tiltglass", "copperwhistle", "afterglow", "lastlight"],
} as const satisfies Record<string, readonly CourseId[]>;
export const SERIES_POINTS = Object.freeze([10, 8, 6, 4, 3, 2, 1, 0] as const);
export type SeriesId = keyof typeof SERIES_COURSES;
export interface SeriesRound { courseId: CourseId; results: RaceResult[] }
export interface SeriesProgress { version: 1; cup: SeriesId; rounds: SeriesRound[] }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown, maximum: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum;
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);

/** Bounded result metadata, not proof that a simulation actually reached its terminal state. */
export function parseSeriesResults(value: unknown): RaceResult[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return null;
  const results: RaceResult[] = [], ids = new Set<string>();
  for (const [index, entry] of value.entries()) {
    if (!record(entry) || !exact(entry, ["id", "name", "position", "finished", "disconnected", "time", "progress", "points"]) ||
      !id(entry.id) || ids.has(entry.id) || typeof entry.name !== "string" || !entry.name.trim() ||
      !/^[^\u0000-\u001f\u007f<>]{1,32}$/.test(entry.name) || entry.position !== index + 1 ||
      typeof entry.finished !== "boolean" || typeof entry.disconnected !== "boolean" ||
      !(entry.time === null || finite(entry.time, 1800)) || entry.finished !== (entry.time !== null) ||
      !finite(entry.progress, 256) || entry.points !== SERIES_POINTS[index]) return null;
    const previous = results.at(-1);
    if (previous && ((!previous.finished && entry.finished) ||
      (previous.time !== null && entry.time !== null && entry.time < previous.time) ||
      (!previous.finished && !entry.finished && entry.progress > previous.progress))) return null;
    ids.add(entry.id);
    results.push({
      id: entry.id, name: entry.name, position: index + 1, finished: entry.finished, disconnected: entry.disconnected,
      time: entry.time, progress: entry.progress, points: SERIES_POINTS[index],
    });
  }
  return results;
}

export function createSeries(cup: SeriesId): SeriesProgress {
  if (!Object.hasOwn(SERIES_COURSES, cup)) throw new RangeError("Unknown circuit.");
  return { version: 1, cup, rounds: [] };
}
export function nextSeriesCourse(series: SeriesProgress): CourseId | null {
  if (!Object.hasOwn(SERIES_COURSES, series.cup)) throw new RangeError("Unknown circuit.");
  return SERIES_COURSES[series.cup][series.rounds.length] ?? null;
}
export function parseSeries(value: unknown): SeriesProgress | null {
  if (!record(value) || !exact(value, ["version", "cup", "rounds"]) || value.version !== 1 ||
    typeof value.cup !== "string" || !Object.hasOwn(SERIES_COURSES, value.cup)) return null;
  const cup = value.cup as SeriesId, courses = SERIES_COURSES[cup];
  if (!Array.isArray(value.rounds) || value.rounds.length > courses.length) return null;
  const rounds: SeriesRound[] = [], allIds = new Set<string>();
  for (const [index, round] of value.rounds.entries()) {
    if (!record(round) || !exact(round, ["courseId", "results"]) || round.courseId !== courses[index]) return null;
    const results = parseSeriesResults(round.results);
    if (!results) return null;
    for (const entry of results) allIds.add(entry.id);
    rounds.push({ courseId: courses[index], results });
  }
  if (allIds.size > 8) return null;
  return { version: 1, cup, rounds };
}
/** The caller attests terminal state separately; signaling has references, not simulation bodies. */
export function appendSeriesResults(series: SeriesProgress, courseId: CourseId, results: readonly RaceResult[]): SeriesProgress {
  const current = parseSeries(series);
  if (!current || courseId !== nextSeriesCourse(current)) throw new RangeError("Only the next circuit course's completed results can be recorded.");
  const result = parseSeries({ ...current, rounds: [...current.rounds, { courseId, results }] });
  if (!result) throw new RangeError("Circuit results exceeded the bounded roster.");
  return result;
}
