import React from "react";
import type { ItemId } from "@kartsick/content";
import { formatTime } from "../storage";

export interface ViewportRect { x: number; y: number; width: number; height: number }
export interface HudView {
  id: string;
  label: string;
  viewport: ViewportRect;
}
export interface HeldItemView {
  id: ItemId; name: string; color: string; count: number;
  spinning: boolean; progress: number; token: string;
}
export interface HudValues {
  id: string;
  position: number;
  fieldSize: number;
  lap: number;
  laps: number;
  time: number;
  lapTime: number;
  speed: number;
  driftCharge: number;
  driver: string;
  rear: string;
  frontItem: HeldItemView | null;
  rearItem: HeldItemView | null;
  tell: string;
  vision: boolean;
  invincible: boolean;
  ghostTime: number | null;
  courseName: string;
  sector: boolean;
  finished: boolean;
}
export interface HudFrame {
  views: HudValues[];
  countdown: number | null;
  finishCountdown: number | null;
  fps: number;
  p95: number;
  connection: string;
}
const setText = (root: ParentNode, key: string, value: string) => {
  const element = root.querySelector<HTMLElement>(`[data-race="${key}"]`);
  if (element && element.textContent !== value) element.textContent = value;
};
export function updateGameHud(root: HTMLElement, frame: HudFrame): void {
  for (const view of frame.views) {
    const node = Array.from(root.querySelectorAll<HTMLElement>("[data-kart-view]")).find(node => node.dataset.kartView === view.id);
    if (!node) continue;
    const values: Record<string, string> = {
      place: String(view.position), field: `/ ${view.fieldSize}`, lap: `${view.lap} / ${view.laps}`,
      lapLabel: view.sector ? "SECTOR" : "LAP", time: formatTime(view.time), lapTime: formatTime(view.lapTime),
      speed: String(Math.round(Math.abs(view.speed) * 3.6)), driver: view.driver, rear: view.rear,
      tell: view.tell, charge: view.driftCharge > 0 ? `${view.driftCharge} / 3` : "",
      ghost: view.ghostTime === null ? "" : `GHOST ${formatTime(view.ghostTime)}`,
      course: view.courseName, countdown: frame.countdown === null ? "" : String(Math.max(1, Math.ceil(frame.countdown))),
      finishCountdown: frame.finishCountdown === null ? "" : `FINISH IN ${Math.max(0, Math.ceil(frame.finishCountdown))}`,
    };
    for (const [key, value] of Object.entries(values)) setText(node, key, value);
    node.dataset.vision = String(view.vision);
    node.dataset.invincible = String(view.invincible);
    node.dataset.finished = String(view.finished);
    node.dataset.charge = String(view.driftCharge);
    [view.frontItem, view.rearItem].forEach((item, index) => {
      const slot = node.querySelector<HTMLElement>(`[data-item-slot="${index}"]`);
      if (!slot) return;
      const use = slot.querySelector("use");
      const name = slot.querySelector<HTMLElement>("[data-item-name]");
      const count = slot.querySelector<HTMLElement>("[data-item-count]");
      slot.dataset.empty = String(item === null);
      const settled = item && !item.spinning && slot.dataset.spinning === "true" && slot.dataset.token === item.token;
      slot.dataset.spinning = String(item?.spinning ?? false);
      slot.dataset.settled = String(!!settled || !!item && !item.spinning && slot.dataset.token === item.token && slot.dataset.settled === "true");
      slot.dataset.token = item?.token ?? "";
      slot.style.setProperty("--roulette-progress", String(item?.progress ?? 0));
      slot.setAttribute("aria-label", item ? `${index === 0 ? view.driver : view.rear}: ${item.spinning ? "choosing an item" : `${item.name}, ${item.count} remaining`}` : `${index === 0 ? view.driver : view.rear}: no item`);
      if (item) {
        use?.setAttribute("href", `#item-glyph-${item.id}`);
        slot.style.setProperty("--item-color", item.color);
      } else use?.removeAttribute("href");
      if (name) name.textContent = item?.name ?? "Empty";
      if (count) count.textContent = item && item.count > 1 ? String(item.count) : "";
    });
  }
  setText(root, "connection", frame.connection);
  setText(root, "performance", `${Math.round(frame.fps)} FPS / p95 ${frame.p95.toFixed(1)} ms`);
}

export function splitViewports(count: number): ViewportRect[] {
  if (!Number.isInteger(count) || count < 1 || count > 4) throw new RangeError("Split-screen needs one to four local kart views.");
  if (count === 1) return [{ x: 0, y: 0, width: 1, height: 1 }];
  if (count === 2) return [
    { x: 0, y: 0.5, width: 1, height: 0.5 }, { x: 0, y: 0, width: 1, height: 0.5 },
  ];
  return Array.from({ length: count }, (_, index) => ({
    x: index % 2 * 0.5, y: index < 2 ? 0.5 : 0, width: 0.5, height: 0.5,
  }));
}

export function GameHud({ views, visible, rootRef, pause, map }: {
  views: HudView[]; visible: boolean; rootRef: React.RefObject<HTMLDivElement | null>; pause: () => void;
  map?: React.ReactNode;
}): React.JSX.Element {
  return <div className={`race-huds ${visible ? "is-visible" : ""}`} ref={rootRef} data-view-count={views.length} aria-hidden={!visible}>
    {views.map(view => <section key={view.id} className="kart-hud" data-kart-view={view.id} style={{
      left: `${view.viewport.x * 100}%`, top: `${(1 - view.viewport.y - view.viewport.height) * 100}%`,
      width: `${view.viewport.width * 100}%`, height: `${view.viewport.height * 100}%`,
    }} aria-label={`${view.label} race view`}>
      <div className="vision-splatter" />
      <div className="race-place"><strong data-race="place">1</strong><span data-race="field">/ 8</span></div>
      <div className="race-course"><span data-race="course">BUTTERBELL</span><b>{view.label}</b></div>
      <div className="race-laps"><span data-race="lapLabel">LAP</span><strong data-race="lap">1 / 3</strong><b data-race="time">0:00.000</b></div>
      <div className="race-items">
        {[0, 1].map(index => <div key={index} className="held-item" data-item-slot={index} data-empty="true" role="img" aria-label="No item">
          <span className="item-rider" data-race={index === 0 ? "driver" : "rear"} />
          <svg viewBox="0 0 48 48" aria-hidden="true"><use /></svg><b data-item-count /><span data-item-name>Empty</span>
          <i className="roulette-progress" aria-hidden="true" />
        </div>)}
      </div>
      <div className="race-message"><strong data-race="tell" /><span data-race="charge" /><b data-race="finishCountdown" /></div>
      <div className="race-speed"><strong data-race="speed">0</strong><span>km/h</span><b data-race="lapTime">0:00.000</b></div>
      <div className="ghost-time" data-race="ghost" />
      <div className="start-countdown" data-race="countdown" aria-live="polite" />
      {map && views.length !== 3 && <div className="view-minimap">{map}</div>}
    </section>)}
    {map && views.length === 3 && <div className="race-minimap">{map}</div>}
    <button className="race-pause" tabIndex={visible ? 0 : -1} onClick={pause} aria-label="Pause race">II</button>
    <div className="race-connection" data-race="connection" />
    <div className="race-performance" data-race="performance" />
  </div>;
}
