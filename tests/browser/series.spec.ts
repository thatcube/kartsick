import { test, expect } from "./fixture";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { COURSES, CUPS, getCourse, type CourseId } from "@kartsick/content";
import { RACE_POINTS, type RaceResult } from "@kartsick/simulation";
import { freshGame, GAME_STORAGE_KEY, type GameSave } from "../../apps/web/src/game-storage";
import type { RaceRuntime } from "../../apps/web/src/race-runtime";
import type { SeriesDriveEvidence } from "./series-pilot";

declare global {
  interface Window {
    __KARTSICK_RACE__?: { read: () => ReturnType<RaceRuntime["snapshot"]> };
  }
}

const pilotUrl = "/@fs" + new URL("./series-pilot.ts", import.meta.url).pathname;
const schedules = {
  town: ["butterbell", "escaluna", "tiltglass"],
  horizon: ["copperwhistle", "afterglow", "lastlight"],
  tour: ["butterbell", "escaluna", "tiltglass", "copperwhistle", "afterglow", "lastlight"],
} as const;
const courseName = (id: CourseId) => COURSES.find(course => course.id === id)!.name;
const budgetFor = (id: CourseId) => {
  const course = getCourse(id);
  return Math.min(600_000, Math.max(180_000, Math.ceil(course.length * course.laps / 12) * 1000 + 75_000));
};

async function controllerButton(page: Page, button: number): Promise<void> {
  await page.evaluate(async button => {
    const pad = window.__testPad!;
    const frames = async () => {
      for (let index = 0; index < 3; index++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    };
    pad.buttons[button] = { value: 1, pressed: true, touched: true };
    try { await frames(); }
    finally { pad.buttons[button] = { value: 0, pressed: false, touched: false }; }
    await frames();
  }, button);
}

async function activate(page: Page, button: Locator): Promise<void> {
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.focus();
  await controllerButton(page, 0);
}

async function savedGame(page: Page): Promise<GameSave> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), GAME_STORAGE_KEY);
}

async function keepEvidence(info: TestInfo, name: string, data: unknown): Promise<void> {
  const path = info.outputPath(`${name}.json`);
  await writeFile(path, JSON.stringify(data, null, 2));
  await info.attach(name, { path, contentType: "application/json" });
}

async function openCircuit(page: Page, id: keyof typeof schedules): Promise<number> {
  const save = freshGame("Circuit driver");
  save.settings.quality = "low";
  save.settings.reducedMotion = true;
  await page.addInitScript(({ key, save }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save));
    window.__testPad = {
      id: "Xbox series controller", index: 0, connected: true, mapping: "standard", timestamp: 1, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })),
    };
    Object.defineProperty(navigator, "getGamepads", { value: () => [window.__testPad], configurable: true });
  }, { key: GAME_STORAGE_KEY, save });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Main menu", exact: true })).toBeVisible();
  await controllerButton(page, 7);
  await activate(page, page.getByRole("button", { name: /^Quick race / }));
  await expect(page.locator(".player-device")).toContainText("Xbox series controller");
  const circuit = CUPS.find(cup => cup.id === id)!;
  const mode = page.getByRole("button", { name: /^Mode / });
  for (let attempt = 0; attempt < CUPS.length + 2 && !(await mode.innerText()).includes(circuit.name); attempt++) {
    await activate(page, mode);
  }
  await expect(page.getByRole("heading", { name: circuit.name, exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Race setup", exact: true })).toContainText(schedules[id].map(courseName).join(" / "));
  await expect(page.getByRole("button", { name: /^Class / })).toContainText("100");
  await expect(page.getByRole("button", { name: /^Mirror / })).toHaveAttribute("aria-pressed", "false");
  // A no-bot race is an ordinary UI option, not a time trial or a shortened
  // schedule. It makes medals deterministic without granting any finishes.
  const bots = page.getByRole("button", { name: /^Fill empty karts with bots / });
  if (await bots.getAttribute("aria-pressed") === "true") await activate(page, bots);
  await expect(bots).toHaveAttribute("aria-pressed", "false");
  expect(await savedGame(page)).toMatchObject({ races: 0, wins: 0, medals: [], records: [] });
  await activate(page, page.getByRole("button", { name: "Start circuit", exact: true }));
  return save.settings.buttons.recover;
}

function expectedGates(id: CourseId): number[] {
  const course = getCourse(id);
  const gates = Array.from({ length: course.checkpoints.length - 1 }, (_, index) => index + 1);
  return course.format === "sectors" ? gates : Array.from({ length: course.laps }, () => [...gates, 0]).flat();
}

for (const id of ["town", "horizon", "tour"] as const) {
  test(`${id}: synthetic controller finishes earn cumulative standings, a saved medal and an explicit rematch`, async ({ page }, info) => {
    const schedule = schedules[id], circuit = CUPS.find(cup => cup.id === id)!;
    test.setTimeout(schedule.reduce((total, course) => total + budgetFor(course) + 60_000, 120_000));
    expect(circuit.courses).toEqual(schedule);
    expect(schedule.every(course => COURSES.some(candidate => candidate.id === course && candidate.available))).toBe(true);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    const evidence: { courseId: CourseId; drive: SeriesDriveEvidence; results: RaceResult[]; saved: Pick<GameSave, "races" | "wins" | "medals"> }[] = [];
    const rounds: RaceResult[][] = [];
    const recoverButton = await openCircuit(page, id);
    try {
      for (const [round, courseId] of schedule.entries()) {
        const budget = budgetFor(courseId);
        await page.waitForFunction(courseId => {
          const snapshot = window.__KARTSICK_RACE__?.read();
          return snapshot?.mode === "race" && snapshot.race.options.courseId === courseId;
        }, courseId);
        const initial = await page.evaluate(() => window.__KARTSICK_RACE__!.read());
        expect(initial.renderedCourse).toBe(courseId);
        expect(initial.race.options).toMatchObject({ courseId, mode: "race", speedClass: 100, mirror: false, bots: false });
        expect(initial.race.karts).toHaveLength(1);
        expect(initial.race.karts[0].players).toEqual(["local-1", null]);
        expect(initial.race.karts[0].state).toMatchObject({ lap: 1, lapTimes: [], finished: false, nextCheckpoint: 1 });
        expect(initial.race.results).toEqual([]);
        expect(initial.race.tick).toBeLessThan(180);
        let drive: SeriesDriveEvidence | null = null;
        try {
          await page.evaluate(async ({ url, budget, recoverButton }) => {
            (await import(url)).startSeriesPilot(budget, recoverButton);
          }, { url: pilotUrl, budget, recoverButton });
          await expect.poll(() => page.evaluate(async url => {
            const pilot = (await import(url)).readSeriesPilot() as SeriesDriveEvidence | null;
            return (pilot?.violations.length ?? 0) > 0 || window.__KARTSICK_RACE__?.read().race.phase === "finished";
          }, pilotUrl), { timeout: budget + 10_000, intervals: [500] }).toBe(true);
        } finally {
          drive = await page.evaluate(async url => (await import(url)).stopSeriesPilot(), pilotUrl);
          if (drive) await keepEvidence(info, `${round + 1}-${courseId}-controller-journal`, drive);
        }
        expect(drive).not.toBeNull();
        expect(drive!.violations, JSON.stringify(drive)).toEqual([]);
        expect(drive!.finished).toBe(true);
        expect(drive!.frames).toBeGreaterThan(300);
        expect(drive!.elapsed).toBeGreaterThan(10);
        expect(drive!.checkpoints.map(checkpoint => checkpoint.gate)).toEqual(expectedGates(courseId));
        expect(drive!.laps).toHaveLength(3);
        const course = getCourse(courseId);
        if (course.glides.length) {
          expect(drive!.launches).toBeGreaterThanOrEqual(course.laps);
          expect(drive!.landings).toBe(drive!.launches);
        }
        await expect(page.getByRole("region", { name: "Race results", exact: true })).toBeVisible();
        const completed = await page.evaluate(() => window.__KARTSICK_RACE__!.read().race);
        expect(completed.phase).toBe("finished");
        expect(completed.karts[0].state.finished).toBe(true);
        expect(completed.karts[0].state.lap).toBe(3);
        expect(completed.karts[0].ai).toBe(false);
        expect(completed.results).toHaveLength(1);
        const result = completed.results[0];
        expect(result).toMatchObject({ id: "local-kart-1", name: "Circuit driver", finished: true, disconnected: false, position: 1, points: RACE_POINTS[0] });
        expect(result.time).toBeCloseTo(drive!.elapsed, 5);
        rounds.push(completed.results);
        const points = rounds.reduce((sum, results) => sum + results.find(entry => entry.id === result.id)!.points, 0);
        const standings = page.getByRole("region", { name: "Circuit standings", exact: true });
        await expect(standings.getByRole("heading")).toHaveText(`${circuit.name} / ${round + 1} of ${schedule.length}`);
        await expect(standings.locator("tbody tr")).toHaveCount(1);
        const row = standings.locator("tbody tr[data-local='true']");
        await expect(row.getByRole("rowheader")).toHaveText(result.name);
        await expect(row.locator("td").nth(0)).toHaveText("1");
        await expect(row.locator("td").nth(1)).toHaveText(rounds.map(results => results[0].position).join(" / "));
        await expect(row.locator("td").nth(2)).toHaveText(String(points));
        const saved = await savedGame(page);
        expect(saved.races).toBe(round + 1);
        expect(saved.wins).toBe(round + 1);
        expect(saved.records).toEqual([]);
        evidence.push({ courseId, drive: drive!, results: completed.results, saved: { races: saved.races, wins: saved.wins, medals: saved.medals } });
        await page.screenshot({ path: info.outputPath(`${round + 1}-${courseId}-standings.png`) });
        await page.waitForTimeout(750);
        const waiting = await page.evaluate(() => window.__KARTSICK_RACE__!.read().race);
        expect(waiting.tick).toBe(completed.tick);
        expect(waiting.results).toEqual(completed.results);
        expect((await savedGame(page)).races).toBe(round + 1);
        await expect(row.locator("td").nth(2)).toHaveText(String(points));
        if (round + 1 < schedule.length) {
          expect(saved.medals).toEqual([]);
          await expect(standings).toContainText(`Next: ${courseName(schedule[round + 1])}`);
          await expect(page.getByRole("button", { name: "Run this circuit again", exact: true })).toHaveCount(0);
          await activate(page, page.getByRole("button", { name: "Next course", exact: true }));
        } else {
          const medal = { cup: id, speedClass: 100, mirror: false, medal: "gold", points };
          expect(saved.medals).toEqual([medal]);
          expect(points).toBe(schedule.length * 10);
          await expect(page.locator(".result-message")).toHaveText("Gold medal saved to the trophy shelf!");
          await expect(page.getByRole("button", { name: "Next course", exact: true })).toHaveCount(0);
          await activate(page, page.getByRole("button", { name: "Run this circuit again", exact: true }));
          await page.waitForFunction(courseId => {
            const snapshot = window.__KARTSICK_RACE__?.read();
            return snapshot?.mode === "race" && snapshot.race.options.courseId === courseId;
          }, schedule[0]);
          const rematch = await page.evaluate(() => window.__KARTSICK_RACE__!.read().race);
          expect(rematch.tick).toBeLessThan(180);
          expect(rematch.results).toEqual([]);
          expect(rematch.karts[0].state).toMatchObject({ nextCheckpoint: 1, lap: 1, lapTimes: [], finished: false, elapsed: 0 });
          expect(await savedGame(page)).toMatchObject({ medals: [medal], races: schedule.length, wins: schedule.length });
          await expect(page.getByRole("region", { name: "Circuit standings", exact: true })).toHaveCount(0);
          await controllerButton(page, 9);
          await expect(page.getByRole("heading", { name: "Race paused.", exact: true })).toBeVisible();
          await activate(page, page.getByRole("button", { name: "Leave race", exact: true }));
          await expect(page.getByRole("region", { name: "Main menu", exact: true })).toBeVisible();
          await page.reload();
          await expect(page.getByRole("region", { name: "Main menu", exact: true })).toBeVisible();
          await controllerButton(page, 7);
          await activate(page, page.getByRole("button", { name: /^Local records / }));
          await expect(page.getByRole("heading", { name: "The trophy shelf", exact: true })).toBeVisible();
          await expect(page.locator(".medal-shelf article")).toHaveCount(1);
          await expect(page.locator(".medal-shelf article")).toHaveAttribute("data-medal", "gold");
          await expect(page.locator(".medal-shelf article b")).toHaveText(circuit.name);
          await expect(page.locator(".medal-shelf article")).toContainText(`100 / Normal / ${points} points`);
          expect(await savedGame(page)).toMatchObject({ medals: [medal], races: schedule.length, wins: schedule.length });
          await page.screenshot({ path: info.outputPath(`${id}-earned-medal-after-reload.png`) });
        }
      }
      expect(evidence.map(round => round.courseId)).toEqual(schedule);
      expect(errors).toEqual([]);
    } finally {
      try {
        if (!page.isClosed()) await page.evaluate(async url => (await import(url)).stopSeriesPilot(), pilotUrl);
      } finally {
        await keepEvidence(info, `${id}-series-evidence`, { errors, rounds: evidence });
      }
    }
  });
}
