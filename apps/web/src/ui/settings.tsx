import React, { useState } from "react";
import type { Calibration, ControllerFamily, GameButtonAction, GameKeyAction, GameSettings } from "../game-controls";
import { ACTION_LABELS, GAME_BUTTON_ACTIONS, GAME_KEY_ACTIONS, buttonName, keyName } from "../game-controls";
import type { PlayerProfile } from "../game-storage";
import { Choice, Range, Toggle } from "./menu-controls";

export function GameSettingsPanel({ settings, change, close, canWrite, resetSave }: {
  settings: GameSettings; change: (settings: GameSettings) => void; close: () => void; canWrite: boolean; resetSave: () => void;
}): React.JSX.Element {
  const [confirmReset, setConfirmReset] = useState(false);
  return <section className="game-panel" data-game-menu aria-label="Settings">
    <header className="panel-heading"><div><p className="pit-label">Make yourself comfortable</p><h1>Settings</h1></div><button data-pad onClick={close}>Back</button></header>
    <h2>Sound</h2>
    {(["master", "music", "effects"] as const).map(key => <Range key={key} label={key === "master" ? "Master volume" : key === "music" ? "Music" : "Effects"}
      value={settings[key]} min={0} max={1} step={0.05} change={value => change({ ...settings, [key]: value })} />)}
    <h2>Picture</h2>
    <Choice label="Graphics" value={settings.quality} change={quality => change({ ...settings, quality })}
      options={[{ value: "low", label: "Low" }, { value: "balanced", label: "Balanced" }, { value: "high", label: "High" }]}
      detail="Split-screen reduces resolution and dynamic shadows to protect response time." />
    <Toggle label="Reduced motion" value={settings.reducedMotion} change={reducedMotion => change({ ...settings, reducedMotion })} detail="Less camera movement, animated scenery, and particle feedback." />
    <Toggle label="Camera shake" value={settings.shake} change={shake => change({ ...settings, shake })} />
    <h2>Local saves</h2>
    <p className="panel-note">{canWrite ? "Profiles, builds, settings, medals and records stay in this browser. There are no accounts or cloud saves." :
      "Saving is currently unavailable or the previous save is unreadable. Changes stay in memory until saving is restored."}</p>
    {!confirmReset ? <button data-pad className="game-text-button" onClick={() => setConfirmReset(true)}>Reset local game data...</button> :
      <div className="danger-confirm" role="group" aria-label="Confirm save reset"><strong>Delete this browser's Kartsick progress?</strong>
        <p>This resets all four profiles, builds, records, medals, ghosts and settings. The old driving-study save is not deleted.</p>
        <button data-pad onClick={() => setConfirmReset(false)}>Keep my progress</button><button data-pad onClick={() => { resetSave(); setConfirmReset(false); }}>Reset game data</button>
      </div>}
  </section>;
}

export function ControlsPanel({ settings, change, profile, family, calibration, setCalibration, remapNotice, remapKey, remapButton, cancelRemap, close }: {
  settings: GameSettings; change: (settings: GameSettings) => void; profile: PlayerProfile; family: ControllerFamily;
  calibration: Calibration; setCalibration: (value: Calibration | null) => void; remapNotice: string | null;
  remapKey: (action: GameKeyAction) => void; remapButton: (action: GameButtonAction) => void; cancelRemap: () => void; close: () => void;
}): React.JSX.Element {
  const [tab, setTab] = useState<"driving" | "bindings" | "calibration">("driving");
  return <section className="game-panel controls-panel" data-game-menu aria-label="Controls">
    <header className="panel-heading"><div><p className="pit-label">{profile.name}'s controls</p><h1>Your hands. Your kart.</h1></div><button data-pad onClick={close}>Back</button></header>
    <nav className="pit-tabs" aria-label="Control sections">{(["driving", "bindings", "calibration"] as const).map(value =>
      <button data-pad key={value} aria-pressed={tab === value} onClick={() => { cancelRemap(); setTab(value); }}>{value[0].toUpperCase() + value.slice(1)}</button>)}</nav>
    {tab === "driving" && <>
      <div className="driving-lessons">
        <article><span>Drive</span><h2>You do the driving.</h2><p>Left stick to steer. {buttonName(settings.buttons.throttle, family)} to accelerate; {buttonName(settings.buttons.brake, family)} to brake, then reverse. There is no steering or acceleration assist.</p></article>
        <article><span>Drift</span><h2>Out. In. Let it go.</h2><p>Hold {buttonName(settings.buttons.drift, family)} as you turn. Countersteer out and back in to build the three-stage mini-turbo. Release drift to use it.</p></article>
        <article><span>Fly</span><h2>Pick your landing.</h2><p>The glider opens at launch ramps. Steer with the left stick; pull back for lift or push forward to dive. Invert pitch in Calibration if you prefer.</p></article>
        <article><span>Tandem</span><h2>Two people. One view.</h2><p>The driver steers and holds drift; the rear rider countersteers to charge the mini-turbo and uses items. Both press {buttonName(settings.buttons.swap, family)} together to swap. Alone, one press swaps your riders.</p></article>
      </div>
      <p className="panel-note">Use {buttonName(settings.buttons.useItem, family)} for your item and {buttonName(settings.buttons.passItem, family)} to pass it. Pull the stick back when using an item to throw backward where supported. Rear ground attacks use {buttonName(settings.buttons.slideLeft, family)} / {buttonName(settings.buttons.slideRight, family)}.</p>
      <p className="panel-note">Menu / Start opens the pause menu. Online races do not pause for one player's menu; an unoccupied kart gets temporary takeover. Recover with {buttonName(settings.buttons.recover, family)} if you are stuck.</p>
    </>}
    {tab === "bindings" && <>
      <Toggle label="Face-button driving" value={settings.faceDrive} change={faceDrive => change({ ...settings, faceDrive })}
        detail="Use the lower face buttons as alternate throttle/brake unless assigned to another active action. Triggers still work." />
      {remapNotice && <div className="remap-prompt" role="status">{remapNotice}<button data-pad onClick={cancelRemap}>Cancel</button></div>}
      <div className="binding-columns"><section><h2>Controller</h2>{GAME_BUTTON_ACTIONS.map(action =>
        <button data-pad key={action} className="game-binding" onClick={() => remapButton(action)}><span>{ACTION_LABELS[action]}</span><kbd>{buttonName(settings.buttons[action], family)}</kbd></button>)}</section>
        <section><h2>Keyboard</h2>{GAME_KEY_ACTIONS.map(action =>
          <button data-pad key={action} className="game-binding" onClick={() => remapKey(action)}><span>{ACTION_LABELS[action]}</span><kbd>{keyName(settings.keys[action])}</kbd></button>)}</section></div>
      <p className="panel-note">Conflicting mappings swap places. Menu / Start, Home and Escape are reserved. These action mappings apply to every local player; stick calibration is per player.</p>
    </>}
    {tab === "calibration" && <>
      <div className="stick-calibration" data-calibration={profile.id}><div className="stick-field"><i data-stick-dot /></div><output data-stick-value>Move your controller's left stick.</output></div>
      <Range label="Stick deadzone" min={0.03} max={0.4} step={0.01} value={calibration.deadzone} change={deadzone => setCalibration({ ...calibration, deadzone })} />
      <Range label="Steering sensitivity" min={0.6} max={1.5} step={0.05} value={calibration.sensitivity} suffix="x" change={sensitivity => setCalibration({ ...calibration, sensitivity })} />
      <Toggle label="Invert flight pitch" value={calibration.invertPitch} change={invertPitch => setCalibration({ ...calibration, invertPitch })} />
      <button data-pad className="game-text-button" onClick={() => setCalibration(null)}>Use default calibration</button>
      <p className="panel-note">Let go of the stick, then increase the deadzone only enough to stop unwanted movement. Sensitivity changes your input range; it does not steer for you.</p>
    </>}
  </section>;
}
