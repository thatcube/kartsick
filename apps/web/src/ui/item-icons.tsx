import React from "react";
import { ITEM_IDS } from "@kartsick/content";
import type { ItemId } from "@kartsick/content";

function drawing(item: ItemId): React.ReactNode {
  switch (item) {
    case "slip": case "triple-slip":
      return <><path d="M5 31q5-7 11-3l5-12 7 2 3 10q9-3 12 5-6 8-17 5-12 4-21-7Z" /><path d="m18 30 3-6 5 2m4 7 5-1" fill="none" /></>;
    case "bounce": case "triple-bounce":
      return <><path d="m7 24 8-13 16-2 10 12-5 16-18 3Z" /><path d="m17 17 10-2 7 8-3 10-11 1-6-8Z" fill="none" /><path d="m4 10 5-4m28 35 5 2" /></>;
    case "homing": case "triple-homing":
      return <><circle cx="24" cy="24" r="15" /><path d="m18 31 5-18 8 5Z" fill="var(--game-paper)" /><path d="M24 5V2M43 24h3M24 43v3M5 24H2" fill="none" /></>;
    case "leader":
      return <><path d="m24 5 16 14-16 19L8 19Z" /><path d="m15 20 2-7 7 5 7-5 2 7Z" fill="var(--game-paper)" /><path d="m24 38-6 6 8 1" fill="none" /></>;
    case "bomb":
      return <><path d="M14 18h20l5 18q-15 9-30 0Z" /><path d="M17 18v-5h14v5m-7-5V6l8-2" fill="none" /><circle cx="24" cy="29" r="7" fill="var(--game-paper)" /><path d="M24 24v5l4 2" fill="none" /></>;
    case "boost": case "triple-boost":
      return <><path d="m19 7 17 6-8 27-17-6Z" /><path d="m16 20 8-3-2 7 8-3-8 11 2-7-9 3" fill="var(--game-paper)" /><path d="m10 7-4 6m7 28-5 4m31-11 5-5" fill="none" /></>;
    case "rapid-boost": case "static":
      return <><path d="M8 11h7v25H8Zm25 0h7v25h-7Z" /><path d="m15 14 18 5-18 5 18 5-18 5" fill="none" /><path d="m26 3-7 7h6l-2 7 8-9h-6Z" /></>;
    case "invincible":
      return <><path d="m24 4 16 7-3 21-13 12L11 32 8 11Z" /><path d="m24 12 3 8 8 4-8 3-3 10-3-10-8-3 8-4Z" fill="var(--game-paper)" /></>;
    case "shrink":
      return <><path d="M16 28h16v15H16Z" /><path d="M8 5v17l-5-5m5 5 6-5M40 5v17l-6-5m6 5 5-5" fill="none" /><path d="m18 9 6 8 6-8" /></>;
    case "autopilot":
      return <><path d="M10 18h28l4 16H6Z" /><circle cx="13" cy="36" r="5" /><circle cx="35" cy="36" r="5" /><path d="M17 18v-7h14v7m-7-7V5m0 0 9 3" fill="none" /><path d="m18 25 6-3 6 3" fill="none" /></>;
    case "vision":
      return <><path d="M11 9q8-6 13 5 11-7 12 3 14 6 4 15-4 10-13 3-12 13-17 0-14-7-2-15Z" /><circle cx="14" cy="40" r="3" /><circle cx="39" cy="9" r="3" /></>;
    case "theft":
      return <><path d="M10 36q3-27 14-29 13 3 15 31l-10-4-6 6-7-7Z" /><path d="m12 20 11 2 12-3-3 10H15Z" fill="var(--game-ink)" /><path d="m17 24 4 1m5-1 4-1" stroke="var(--game-paper)" fill="none" /></>;
    case "fire":
      return <><path d="M24 4q4 12 12 12 0 7 5 11 1 15-17 17Q4 40 8 25q7-3 6-12l8 8q5-7 2-17Z" /><path d="M23 24q0 7 7 9 0 8-8 7-9-3 1-16Z" fill="var(--game-paper)" /></>;
    case "returning":
      return <><path d="m9 9 16 12 15-5 3 8-20 12L5 15Z" /><path d="m15 12 11 4 10-4" fill="none" /><path d="m6 31-2 9 9-2" fill="none" /></>;
    case "shockwave":
      return <><circle cx="24" cy="24" r="6" /><circle cx="24" cy="24" r="14" fill="none" /><path d="M24 1v5m0 36v5M1 24h5m36 0h5M7 7l4 4m26 26 4 4M7 41l4-4M37 11l4-4" fill="none" /></>;
    case "roadwork":
      return <><path d="M7 13h34v17H7Z" /><path d="m10 28 9-13m4 13 9-13m3 13 5-8" stroke="var(--game-paper)" /><path d="m14 30-3 10m23-10 3 10" fill="none" /><circle cx="10" cy="41" r="3" /><circle cx="38" cy="41" r="3" /></>;
    case "velvet":
      return <><circle cx="24" cy="24" r="12" fill="none" /><rect x="16" y="3" width="16" height="12" rx="5" /><rect x="2" y="28" width="16" height="12" rx="5" /><rect x="30" y="28" width="16" height="12" rx="5" /></>;
    case "doubles":
      return <><path d="M4 22h16l3 12H1Zm24 0h16l3 12H25Z" /><circle cx="12" cy="15" r="6" /><circle cx="36" cy="15" r="6" /><path d="m7 25 6 6m18-6 6 6M7 36v4m10-4v4m14-4v4m10-4v4" fill="none" /></>;
  }
}

export function ItemSymbols(): React.JSX.Element {
  return <svg width="0" height="0" aria-hidden="true" className="item-symbols"><defs>
    {ITEM_IDS.map(item => <symbol key={item} id={`item-glyph-${item}`} viewBox="0 0 48 48">
      <g fill="currentColor" stroke="var(--game-ink)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">{drawing(item)}</g>
    </symbol>)}
  </defs></svg>;
}

export function ItemIcon({ item, label, className = "" }: { item: ItemId; label?: string; className?: string }): React.JSX.Element {
  return <svg className={`item-icon ${className}`} viewBox="0 0 48 48" role={label ? "img" : undefined} aria-label={label} aria-hidden={!label}>
    <use href={`#item-glyph-${item}`} />
  </svg>;
}
