import { ITEMS } from "@kartsick/content";
import type { HeldItem } from "@kartsick/simulation";
import { ITEM_ROULETTE_SECONDS } from "@kartsick/simulation";
import type { HeldItemView } from "./game-hud";

export function heldItemView(held: HeldItem | null, reducedMotion: boolean): HeldItemView | null {
  if (!held) return null;
  const spinning = held.roulette > 0;
  const progress = 1 - held.roulette / ITEM_ROULETTE_SECONDS;
  // Decelerating reel steps depend only on accepted inventory, never local RNG or frame rate.
  const reel = ITEMS.filter(item => !item.special || item.id === held.item);
  const step = Math.floor(24 * (1 - (1 - progress) ** 2));
  const index = (Number(held.id.slice(1)) + step * 7) % reel.length;
  const display = spinning ? reel[reducedMotion ? Number(held.id.slice(1)) % reel.length : index] : ITEMS.find(item => item.id === held.item);
  if (!display) throw new Error("The held item has no content definition.");
  return { id: display.id, name: spinning ? "Choosing..." : display.name, color: display.color,
    count: spinning ? 0 : held.charges, spinning, progress: spinning ? progress : 1, token: held.id };
}
