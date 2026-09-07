import React, { useState } from "react";
import type {
  BodyId, CharacterDefinition, CharacterId, GliderId, HandlingStats, ItemDefinition,
  KartBuild, PartDefinition, WheelId,
} from "@kartsick/content";
import { DECAL_IDS, PAINT_IDS } from "@kartsick/content";
import type { GameSave } from "../game-storage";
import { validNickname } from "../game-storage";
import { Choice } from "./menu-controls";
import { ItemIcon } from "./item-icons";

export interface GarageCatalog {
  characters: readonly CharacterDefinition[];
  bodies: readonly PartDefinition<BodyId>[];
  wheels: readonly PartDefinition<WheelId>[];
  gliders: readonly PartDefinition<GliderId>[];
  items: readonly ItemDefinition[];
  handling: (build: KartBuild) => HandlingStats;
}
const title = (id: string) => id.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" ");
const STAT_LABELS: [keyof HandlingStats, string][] = [
  ["speed", "Top speed"], ["acceleration", "Acceleration"], ["handling", "Steering"],
  ["grip", "Grip"], ["weight", "Weight"], ["offRoad", "Off-road"],
  ["glideSpeed", "Air speed"], ["glideLift", "Lift"], ["glideHandling", "Air steering"],
];

export function Garage({ build, catalog, presets, change, savePreset, removePreset, close, playerName }: {
  build: KartBuild; catalog: GarageCatalog; presets: GameSave["presets"]; playerName: string;
  change: (build: KartBuild) => void; savePreset: (name: string, build: KartBuild) => void;
  removePreset: (index: number) => void; close: () => void;
}): React.JSX.Element {
  const [seat, setSeat] = useState<0 | 1>(0);
  const [tab, setTab] = useState<"crew" | "parts" | "presets">("crew");
  const [presetName, setPresetName] = useState("");
  const stats = catalog.handling(build);
  const selected = catalog.characters.find(character => character.id === build.characters[seat]);
  const specials = catalog.items.filter(item => item.special && build.characters.some(id =>
    catalog.characters.some(character => character.id === id && character.pair === item.special)));
  function character(id: CharacterId): void {
    if (id === build.characters[seat]) return;
    const characters: [CharacterId, CharacterId] = [...build.characters];
    const other = seat === 0 ? 1 : 0;
    if (characters[other] === id) characters[other] = characters[seat];
    characters[seat] = id;
    change({ ...build, characters });
  }
  return <section className="game-panel garage-panel" data-game-menu aria-label="Garage">
    <header className="panel-heading"><div><p className="pit-label">{playerName}'s kart</p><h1>The garage</h1></div><button data-pad onClick={close}>Done</button></header>
    <nav className="pit-tabs" aria-label="Garage sections">
      {(["crew", "parts", "presets"] as const).map(value => <button data-pad key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{title(value)}</button>)}
    </nav>
    {tab === "crew" && <>
      <div className="seat-tabs" aria-label="Choose a character seat">
        {([0, 1] as const).map(index => <button data-pad key={index} aria-pressed={seat === index} onClick={() => setSeat(index)}>
          <small>{index === 0 ? "Starts driving" : "Starts at the rear"}</small>
          <strong>{catalog.characters.find(character => character.id === build.characters[index])?.name}</strong>
        </button>)}
      </div>
      <div className="character-grid">
        {catalog.characters.map(entry => <button data-pad key={entry.id} aria-pressed={build.characters[seat] === entry.id}
          className="character-choice" style={{ "--character-color": entry.color } as React.CSSProperties} onClick={() => character(entry.id)}>
          <span className="character-initial" aria-hidden="true">{entry.name[0]}</span><strong>{entry.name}</strong>
          <small>{build.characters[seat] === entry.id ? "Selected" : build.characters.includes(entry.id) ? "Switch seats" : title(entry.pair)}</small>
        </button>)}
      </div>
      {selected && <div className="character-note"><h2>{selected.name}</h2><p>{selected.description}</p>
        <button data-pad className="game-text-button" onClick={() => change({ ...build, body: selected.body })}>Use {catalog.bodies.find(body => body.id === selected.body)?.name} body</button></div>}
      <div className="signature-items"><h2>Your signature specials</h2>{specials.map(item => <article key={item.id}>
        <ItemIcon item={item.id} /><div><strong>{item.name}</strong><p>{item.description}</p></div>
      </article>)}</div>
      <p className="panel-note">Any pair. Any parts. Both riders can swap during a race. Picking different pairs changes your signature-special pool.</p>
    </>}
    {tab === "parts" && <>
      <Choice label="Body" value={build.body} options={catalog.bodies.map(part => ({ value: part.id, label: part.name }))}
        detail={catalog.bodies.find(part => part.id === build.body)?.description} change={body => change({ ...build, body })} />
      <Choice label="Wheels" value={build.wheels} options={catalog.wheels.map(part => ({ value: part.id, label: part.name }))}
        detail={catalog.wheels.find(part => part.id === build.wheels)?.description} change={wheels => change({ ...build, wheels })} />
      <Choice label="Glider" value={build.glider} options={catalog.gliders.map(part => ({ value: part.id, label: part.name }))}
        detail={catalog.gliders.find(part => part.id === build.glider)?.description} change={glider => change({ ...build, glider })} />
      <Choice label="Paint" value={build.paint} options={PAINT_IDS.map(value => ({ value, label: title(value) }))} change={paint => change({ ...build, paint })} />
      <Choice label="Decal" value={build.decal} options={DECAL_IDS.map(value => ({ value, label: title(value) }))} change={decal => change({ ...build, decal })} />
      <div className="handling-grid" aria-label="Kart handling">
        {STAT_LABELS.map(([key, label]) => <div key={key}><span>{label}</span><strong>{stats[key].toFixed(2)}<small>&times;</small></strong></div>)}
      </div>
      <p className="panel-note">Handling values are multipliers against the standard kart, not upgrades. More weight changes contact behavior; more grip changes how the kart slides.</p>
    </>}
    {tab === "presets" && <>
      <div className="preset-save"><label>Preset name<input data-pad maxLength={24} placeholder={`${playerName}'s kart`} value={presetName} onChange={event => setPresetName(event.currentTarget.value)} /></label>
        <button data-pad className="game-primary" disabled={presets.length >= 24 || (presetName !== "" && !validNickname(presetName.trim()))}
          onClick={() => { savePreset(presetName.trim() || `Build ${presets.length + 1}`, build); setPresetName(""); }}>Save this build</button></div>
      {presets.length === 0 ? <p className="panel-note">Save a build to switch back to it later. Everything in the garage is already available.</p> :
        <div className="preset-list">{presets.map((preset, index) => <div key={index}>
          <button data-pad onClick={() => change(structuredClone(preset.build))}><strong>{preset.name}</strong><small>{title(preset.build.body)} / {title(preset.build.wheels)} / {title(preset.build.glider)}</small></button>
          <button data-pad aria-label={`Remove preset ${preset.name}`} onClick={() => removePreset(index)}>Remove</button>
        </div>)}</div>}
      {presets.length >= 24 && <p role="status">All 24 preset slots are used. Remove a preset to save another.</p>}
    </>}
  </section>;
}
