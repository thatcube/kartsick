import { describe, expect, it } from "vitest";
import { CUPS, DEFAULT_BUILD } from "@kartsick/content";
import { RACE_POINTS, createRace, stepRace } from "./race";
import type { RaceResult } from "./race";
import { appendSeriesResults, appendSeriesRound, createSeries, nextSeriesCourse, parseSeries, parseSeriesResults, seriesMedal, seriesStandings } from "./series";
import type { SeriesProgress } from "./series";
import { SERIES_COURSES, SERIES_POINTS } from "./series-metadata";

function result(id: string, position: number, finished = true, time = 90): RaceResult {
  return { id, name: id, position, finished, disconnected: false, time: finished ? time : null, progress: finished ? 48 : 10, points: [10, 8, 6, 4, 3, 2, 1, 0][position - 1] };
}
function complete(): SeriesProgress {
  return { version: 1, cup: "town", rounds: CUPS[0].courses.map(courseId => ({
    courseId, results: [result("one", 1), result("two", 2), result("three", 3)],
  })) };
}
describe("circuits and tour scoring", () => {
  it("keeps the wire-safe rules identical to the live content schedule and simulation scoring", () => {
    expect(SERIES_COURSES).toEqual(Object.fromEntries(CUPS.map(cup => [cup.id, cup.courses])));
    expect(SERIES_POINTS).toEqual(RACE_POINTS);
  });
  it("keeps the actual three- and six-course schedules, never substitutes the available course", () => {
    expect(nextSeriesCourse(createSeries("town"))).toBe("butterbell");
    expect(nextSeriesCourse(createSeries("horizon"))).toBe("copperwhistle");
    const tour = createSeries("tour");
    for (const courseId of CUPS[2].courses) {
      expect(nextSeriesCourse(tour)).toBe(courseId);
      tour.rounds.push({ courseId, results: [result("one", 1)] });
    }
    expect(nextSeriesCourse(tour)).toBeNull();
    expect(parseSeries(tour)?.rounds).toHaveLength(6);
  });
  it("aggregates authoritative points and gives a completed top-three local kart its medal", () => {
    const series = complete();
    expect(seriesStandings(series).map(entry => entry.points)).toEqual([30, 24, 18]);
    expect(seriesMedal(series, new Set(["two"]))).toEqual({ medal: "silver", points: 24 });
    series.rounds.pop();
    expect(seriesMedal(series, new Set(["one"]))).toBeNull();
  });
  it("retains incomplete results without fabricating a finish or medal", () => {
    const series = complete();
    series.rounds[2].results = [result("one", 1, false), result("two", 2, false), result("three", 3, false)];
    expect(seriesStandings(series)[0]).toMatchObject({ id: "one", points: 30, finishes: 2 });
    expect(seriesMedal(series, new Set(["one"]))).toBeNull();
    expect(parseSeries(series)).not.toBeNull();
  });
  it("breaks point ties by wins, finishes, recorded time, and a stable ID", () => {
    const series = complete();
    series.rounds[0].results = [result("one", 1, true, 70), result("two", 2, true, 80), result("three", 3)];
    series.rounds[1].results = [result("two", 1, true, 70), result("three", 2, true, 80), result("one", 3)];
    series.rounds[2].results = [result("three", 1, true, 70), result("one", 2, true, 80), result("two", 3, true, 80)];
    expect(seriesStandings(series).map(entry => entry.points)).toEqual([24, 24, 24]);
    expect(seriesStandings(series).map(entry => entry.id)).toEqual(["two", "one", "three"]);
    series.rounds.pop();
    series.rounds[1].results = [result("three", 1, true, 70), result("two", 2, true, 80), result("one", 3)];
    expect(seriesStandings(series).map(entry => entry.id)).toEqual(["one", "three", "two"]);
    series.rounds[1].results[2] = result("one", 3, false);
    expect(seriesStandings(series).map(entry => entry.id)).toEqual(["three", "one", "two"]);
  });
  it("records a genuinely simulated completed round once and produces an independent restorable value", () => {
    const race = createRace({ courseId: "butterbell", mode: "race", speedClass: 100, mirror: false, bots: false, difficulty: "normal", seed: 1 },
      [{ id: "one", name: "One", build: DEFAULT_BUILD, players: [null, null] }]);
    for (let tick = 0; tick < 30_000 && race.phase !== "finished"; tick++) stepRace(race, {});
    expect(race.phase).toBe("finished");
    expect(race.results[0].finished).toBe(true);
    const series = appendSeriesRound(createSeries("town"), race);
    expect(nextSeriesCourse(series)).toBe("escaluna");
    expect(parseSeries(JSON.parse(JSON.stringify(series)))).toEqual(series);
    expect(() => appendSeriesRound(series, race)).toThrow("completed race");
    race.results[0].points = 100;
    expect(series.rounds[0].results[0].points).toBe(10);
  });
  it("rejects reordered courses, duplicate racers, invented points and unfinished race submissions", () => {
    const series = complete();
    series.rounds.reverse();
    expect(parseSeries(series)).toBeNull();
    const duplicate = complete();
    duplicate.rounds[0].results[1].id = "one";
    expect(parseSeries(duplicate)).toBeNull();
    const points = complete();
    points.rounds[0].results[0].points = 100;
    expect(parseSeries(points)).toBeNull();
    const race = createRace({ courseId: "butterbell", mode: "race", speedClass: 100, mirror: false, bots: false, difficulty: "normal", seed: 1 },
      [{ id: "one", name: "One", build: DEFAULT_BUILD, players: ["player", null] }]);
    expect(() => appendSeriesRound(createSeries("town"), race)).toThrow("completed race");
  });
  it("appends independently attested results without weakening full-state validation", () => {
    const rows = [result("one", 1), result("two", 2, false)];
    const first = appendSeriesResults(createSeries("town"), "butterbell", rows);
    expect(nextSeriesCourse(first)).toBe("escaluna");
    rows[0].name = "Changed after append";
    expect(first.rounds[0].results[0].name).toBe("one");
    expect(() => appendSeriesResults(first, "butterbell", rows)).toThrow("next circuit");
    const incomplete = createRace({ courseId: "butterbell", mode: "race", speedClass: 100, mirror: false,
      bots: false, difficulty: "normal", seed: 1 }, [{ id: "one", name: "One", build: DEFAULT_BUILD, players: ["human", null] }]);
    incomplete.results = [result("one", 1)];
    expect(() => appendSeriesRound(createSeries("town"), incomplete)).toThrow("completed race");
  });
  it.each([
    [], Array.from({ length: 9 }, (_, i) => result(String(i), i + 1)),
    [result("one", 2)], [result("one", 1), result("one", 2)],
    [{ ...result("one", 1), name: "\nRacer" }], [{ ...result("one", 1), name: " ".repeat(32) }],
    [{ ...result("one", 1), name: "<b>Racer</b>" }], [{ ...result("one", 1), name: "x".repeat(33) }],
    [{ ...result("one", 1), points: 99 }], [{ ...result("one", 1), time: Infinity }],
    [{ ...result("one", 1), time: 1801 }], [{ ...result("one", 1), progress: NaN }],
    [{ ...result("one", 1), time: null }], [result("one", 1, false), result("two", 2)],
    [result("one", 1, true, 100), result("two", 2, true, 90)],
    [result("one", 1, false), { ...result("two", 2, false), progress: 20 }],
    [{ ...result("one", 1), extra: "not allowed" }],
  ].map(rows => [rows] as const))("rejects invalid bounded result metadata %#", rows => {
    expect(parseSeriesResults(rows)).toBeNull();
    expect(() => appendSeriesResults(createSeries("town"), "butterbell", rows as RaceResult[])).toThrow();
  });
});
