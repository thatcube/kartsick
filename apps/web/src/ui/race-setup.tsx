import React, { useEffect, useState } from "react";
import { COURSES } from "@kartsick/content";
import type { RaceOptions, RaceState } from "@kartsick/simulation";
import type { LocalPlayer } from "../local-input";
import type { KartAssignments } from "../local-race";
import { validNickname } from "../game-storage";
import { formatTime } from "../storage";
import { Choice, Toggle } from "./menu-controls";

function PlayerName({ player, rename }: { player: LocalPlayer; rename: (name: string) => void }): React.JSX.Element {
  const [name, setName] = useState(player.name);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setName(player.name), [player.name]);
  function commit(): void {
    const trimmed = name.trim();
    if (!validNickname(trimmed)) { setInvalid(true); return; }
    setInvalid(false);
    setName(trimmed);
    rename(trimmed);
  }
  return <label className="player-name">Nickname<input data-pad maxLength={24} value={name} aria-invalid={invalid} onChange={event => setName(event.currentTarget.value)}
    onBlur={commit} onKeyDown={event => { if (event.key === "Enter") { commit(); event.currentTarget.blur(); } }} />
    {invalid && <small role="alert">Use 1-24 characters.</small>}</label>;
}

export function RaceSetup({ options, changeOptions, players, assignments, assign, rename, capture, keyboard, addPlayer, removePlayer, garage, controls, start, close }: {
  options: RaceOptions; changeOptions: (options: RaceOptions) => void; players: readonly LocalPlayer[]; assignments: KartAssignments;
  assign: (playerId: string, kart: number) => void; rename: (playerId: string, name: string) => void;
  capture: (playerId: string) => void; keyboard: (playerId: string) => void; addPlayer: () => void; removePlayer: (id: string) => void;
  garage: (playerId: string) => void; controls: (playerId: string) => void; start: () => void; close: () => void;
}): React.JSX.Element {
  const trial = options.mode === "time-trial";
  const missing = players.some(player => !player.connected || (player.device.kind === "unassigned" && players.length > 1));
  const reason = trial && players.length !== 1 ? "Time trials use one local player. Remove the other players or choose Quick race." :
    missing ? "Connect each player's controller or assign the one keyboard." : null;
  return <section className="game-panel setup-panel" data-game-menu aria-label="Race setup">
    <header className="panel-heading"><div><p className="pit-label">No unlocks. No waiting list.</p><h1>{trial ? "Time trial" : "Who's riding?"}</h1></div><button data-pad onClick={close}>Back</button></header>
    <Choice label="Mode" value={options.mode} options={[{ value: "race", label: "Quick race" }, { value: "time-trial", label: "Time trial" }]}
      change={mode => changeOptions({ ...options, mode, bots: mode === "race" })} />
    <Choice label="Course" value={options.courseId} options={COURSES.filter(course => course.available).map(course => ({ value: course.id, label: course.name }))}
      change={courseId => changeOptions({ ...options, courseId })} />
    <div className="race-option-pair">
      <Choice label="Class" value={options.speedClass} options={[{ value: 50, label: "50" }, { value: 100, label: "100" }, { value: 150, label: "150" }]}
        change={speedClass => changeOptions({ ...options, speedClass })} />
      <Toggle label="Mirror" value={options.mirror} change={mirror => changeOptions({ ...options, mirror })} />
    </div>
    {!trial && <><Toggle label="Fill empty karts with bots" value={options.bots} change={bots => changeOptions({ ...options, bots })} />
      {options.bots && <Choice label="Bot difficulty" value={options.difficulty} options={[{ value: "easy", label: "Easy" }, { value: "normal", label: "Normal" }, { value: "hard", label: "Hard" }]}
        change={difficulty => changeOptions({ ...options, difficulty })} />}</>}
    <h2>Local players</h2>
    <div className="local-player-list">{players.map((player, index) => {
      const available = [0, 1, 2, 3].filter(kart => assignments[player.id] === kart || players.filter(other => assignments[other.id] === kart).length < 2);
      return <article key={player.id} className="local-player-card">
        <div className="player-card-heading"><b className="player-number">P{index + 1}</b><PlayerName player={player} rename={name => rename(player.id, name)} /></div>
        <p className="player-device">{!player.connected ? "Controller disconnected" : player.device.kind === "gamepad" ? player.device.id :
          player.device.kind === "keyboard" ? "Keyboard" : "Press a controller button, or use the keyboard"}</p>
        <div className="player-actions"><button data-pad onClick={() => capture(player.id)}>Connect controller</button><button data-pad onClick={() => keyboard(player.id)}>Use keyboard</button></div>
        {!trial && <Choice label="Kart" value={assignments[player.id]} options={available.map(kart => ({
          value: kart, label: `Kart ${kart + 1}${players.some(other => other.id !== player.id && assignments[other.id] === kart) ? " - shared" : ""}`,
        }))} change={kart => assign(player.id, kart)} detail="Put two players in the same kart for tandem play." />}
        <div className="player-actions"><button data-pad onClick={() => garage(player.id)}>Garage</button><button data-pad onClick={() => controls(player.id)}>Controls</button>
          {players.length > 1 && <button data-pad onClick={() => removePlayer(player.id)}>Remove player</button>}</div>
      </article>;
    })}</div>
    {players.length < 4 && !trial && <button data-pad className="game-text-button" onClick={addPlayer}>Add a local player</button>}
    {reason && <p className="panel-note" role="status">{reason}</p>}
    <button data-pad className="game-primary start-race-button" disabled={reason !== null} onClick={start}>{trial ? "Start time trial" : "Race!"}</button>
    <p className="panel-note">{trial ? "Random items are off. Your fixed boost allowance, best time and saved ghost are ready at the start." :
      "One screen per kart. Two people sharing a kart share the same view. The first listed player in each kart supplies its saved build."}</p>
    <p className="development-note">Development build: Butterbell is playable. The other five courses, cups and tour are still in production, not locked content.</p>
  </section>;
}

export function RaceResults({ race, ownKarts, message, rematch, changeRace, home, rematchLabel, rematchDisabled, changeLabel }: {
  race: RaceState; ownKarts: ReadonlySet<string>; message: string | null; rematch: () => void; changeRace: () => void; home: () => void;
  rematchLabel?: string; rematchDisabled?: boolean; changeLabel?: string;
}): React.JSX.Element {
  return <section className="game-panel results-panel" data-game-menu aria-label="Race results">
    <header className="panel-heading"><div><p className="pit-label">{COURSES.find(course => course.id === race.options.courseId)?.name}</p><h1>That's a wrap.</h1></div></header>
    {message && <p className="result-message" role="status">{message}</p>}
    <div className="record-table-wrap"><table className="record-table"><thead><tr><th>Place</th><th>Kart</th><th>Time</th><th>Points</th></tr></thead><tbody>
      {race.results.map(result => <tr key={result.id} data-local={ownKarts.has(result.id)}><td><strong>{result.position}</strong></td><th>{result.name}
        {(!result.finished || result.disconnected) && <small>{result.disconnected ? "Disconnected" : "Incomplete - ranked by progress"}</small>}</th>
        <td>{formatTime(result.time)}</td><td>{result.points}</td></tr>)}
    </tbody></table></div>
    <div className="result-actions"><button data-pad className="game-primary" disabled={rematchDisabled} onClick={rematch}>{rematchLabel ?? "Race again"}</button>
      <button data-pad onClick={changeRace}>{changeLabel ?? "Change race"}</button><button data-pad onClick={home}>Main menu</button></div>
  </section>;
}
