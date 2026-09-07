import React, { useState } from "react";
import type { GameSave } from "../game-storage";
import { formatTime } from "../storage";
import { Choice } from "./menu-controls";

export function RecordsPanel({ save, close, courseNames, ghostKeys }: {
  save: GameSave; close: () => void; courseNames: Readonly<Record<string, string>>; ghostKeys: ReadonlySet<string>;
}): React.JSX.Element {
  const [profile, setProfile] = useState(save.profiles[0].id);
  const records = save.records.filter(record => record.profileId === profile);
  return <section className="game-panel records-panel" data-game-menu aria-label="Local records">
    <header className="panel-heading"><div><p className="pit-label">Right here, in this browser</p><h1>The trophy shelf</h1></div><button data-pad onClick={close}>Back</button></header>
    <div className="career-totals"><div><strong>{save.races}</strong><span>Races</span></div><div><strong>{save.wins}</strong><span>Wins</span></div><div><strong>{save.medals.length}</strong><span>Cup medals</span></div></div>
    <h2>Cup medals</h2>
    {save.medals.length ? <div className="medal-shelf">{save.medals.map(medal => <article key={`${medal.cup}-${medal.speedClass}-${medal.mirror}`} data-medal={medal.medal}>
      <span aria-hidden="true">&#9733;</span><strong>{medal.medal[0].toUpperCase() + medal.medal.slice(1)}</strong><b>{medal.cup === "town" ? "Town Circuit" : medal.cup === "horizon" ? "Horizon Circuit" : "Grand Tour"}</b>
      <small>{medal.speedClass} / {medal.mirror ? "Mirror" : "Normal"} / {medal.points} points</small>
    </article>)}</div> : <p className="panel-note">Finish a cup to put something on the shelf. Medals celebrate results; no parts or courses are locked behind them.</p>}
    <h2>Time trials</h2>
    <Choice label="Player" value={profile} options={save.profiles.map(player => ({ value: player.id, label: player.name }))} change={setProfile} />
    {records.length ? <div className="record-table-wrap"><table className="record-table"><thead><tr><th>Course</th><th>Class</th><th>Best run</th><th>Fastest lap / sector</th><th>Ghost</th></tr></thead>
      <tbody>{records.map(record => <tr key={record.key}><th>{courseNames[record.courseId] ?? record.courseId}<small>{record.courseVersion}</small></th>
        <td>{record.speedClass}{record.mirror && <small>Mirror</small>}</td><td>{formatTime(record.time)}</td><td>{formatTime(record.bestLap)}{record.courseId === "lastlight" && <small>Sector</small>}</td><td>{ghostKeys.has(record.key) ? "Saved" : "Not stored"}</td></tr>)}</tbody></table></div> :
      <p className="panel-note">Complete a time trial to save your first time and racing ghost. Race times are separated by course version, speed class and mirror setting.</p>}
  </section>;
}
