import { parseRaceState } from "./race";
import type { RaceState } from "./race";
import { appendSeriesResults, nextSeriesCourse, parseSeries } from "./series-metadata.ts";
import type { SeriesProgress } from "./series-metadata.ts";
export * from "./series-metadata.ts";
export interface SeriesStanding {
  id: string; name: string; position: number; points: number; wins: number; finishes: number;
  time: number; places: (number | null)[];
}
export function appendSeriesRound(series: SeriesProgress, race: RaceState): SeriesProgress {
  const current = parseSeries(series), completed = parseRaceState(race);
  if (!current || !completed || completed.phase !== "finished" || completed.options.mode !== "race" ||
    completed.options.courseId !== nextSeriesCourse(current)) throw new RangeError("Only the next circuit course's completed race can be recorded.");
  return appendSeriesResults(current, completed.options.courseId, completed.results);
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
