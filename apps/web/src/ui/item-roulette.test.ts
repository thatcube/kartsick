import { expect, it } from "vitest";
import type { HeldItem } from "@kartsick/simulation";
import { ITEM_ROULETTE_SECONDS } from "@kartsick/simulation";
import { heldItemView } from "./item-roulette";

it("cycles a decelerating reel then reveals the actual held result", () => {
  const held: HeldItem = { id: "e17", item: "triple-boost", charges: 3, cooldown: 0, ttl: -1, roulette: ITEM_ROULETTE_SECONDS };
  const frames = Array.from({ length: 96 }, (_, n) => heldItemView({ ...held, roulette: (96 - n) / 60 }, false)!);
  expect(new Set(frames.map(frame => frame.id)).size).toBeGreaterThan(10);
  expect(frames.every(frame => frame.name === "Choosing..." && frame.count === 0 && frame.spinning)).toBe(true);
  expect(heldItemView({ ...held, roulette: 0 }, false)).toMatchObject({ id: held.item, count: 3, spinning: false });
  expect(held.roulette).toBe(ITEM_ROULETTE_SECONDS);
});

it("uses a steady symbol and progress bar under reduced motion without revealing the outcome early", () => {
  const held: HeldItem = { id: "e2", item: "roadwork", charges: 1, cooldown: 0, ttl: -1, roulette: 1.6 };
  const start = heldItemView(held, true)!;
  const end = heldItemView({ ...held, roulette: .1 }, true)!;
  expect(start.id).toBe(end.id);
  expect(start.name).toBe("Choosing...");
  expect(end.progress).toBeGreaterThan(start.progress);
  expect(heldItemView(null, false)).toBeNull();
});
