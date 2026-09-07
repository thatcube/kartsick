import React, { useState } from "react";
import { BODIES, CHARACTERS, COURSES, CUPS, availableSeries } from "@kartsick/content";
import type { KartBuild } from "@kartsick/content";
import type { Room } from "@kartsick/protocol";
import type { LocalPlayer } from "../local-input";
import type { useOnlineRoom } from "../use-online-room";
import { Choice, Toggle } from "./menu-controls";
import { CircuitStandings, type RaceProgram } from "./race-setup";

export function OnlineLobby({ online, players, build, garage, controls, capture, keyboard, addPlayer, back }: {
  online: ReturnType<typeof useOnlineRoom>; players: readonly LocalPlayer[]; build: (id: string) => KartBuild;
  garage: (id: string) => void; controls: (id: string) => void; capture: (id: string) => void; keyboard: (id: string) => void;
  addPlayer: () => void; back: () => void;
}): React.JSX.Element {
  const [invitation, setInvitation] = useState("");
  const [selected, setSelected] = useState(players[0].id);
  const [copied, setCopied] = useState(false);
  const network = online.network.current;
  const room = online.room;
  const id = players.some(player => player.id === selected) ? selected : players[0].id;
  const identities = online.identities();
  const playerId = identities.get(id);
  const host = room?.hostId === network?.participantId;
  const lobby = room?.phase === "lobby";
  const program: Exclude<RaceProgram, "time-trial"> = room?.config.mode === "tour" ? "tour" :
    room?.config.mode === "cup" ? room.config.cup : "quick";
  const member = room?.participants.find(participant => participant.id === network?.participantId);
  const allPlayers = room?.participants.flatMap(participant => participant.players) ?? [];
  const seated = member?.players.filter(player => room?.karts.some(kart => kart.seats.includes(player.id))) ?? [];
  const ready = seated.length > 0 && seated.every(player => player.ready);
  const allReady = !!room && room.karts.some(kart => kart.seats.some(Boolean)) && room.karts.every(kart => kart.seats.every(id => {
    if (!id) return true;
    return room.participants.some(participant => participant.connected && participant.players.some(player => player.id === id && player.ready));
  }));
  async function seat(kart: number, side: 0 | 1): Promise<void> {
    if (!network || !playerId) throw new Error("Choose one of your local players first.");
    await network.connection.seat(playerId, { kart, side });
    if (room?.karts[kart].seats.every(seat => seat === null)) await network.connection.setBuild(kart, build(id));
  }
  function configure(patch: Partial<Room["config"]>): void {
    void online.operation(async () => {
      if (!network?.room) throw new Error("The room is disconnected.");
      await network.connection.configure({ ...network.room.config, ...patch });
    });
  }
  return <section className="game-panel online-panel" data-game-menu aria-label="Online room">
    <header className="panel-heading"><div><p className="pit-label">Your friends. Your room.</p><h1>{room ? "Find your other driver." : "Bring the whole crew."}</h1></div>
      <button data-pad disabled={online.busy} onClick={room ? () => void online.leave() : back}>{room ? "Leave room" : "Back"}</button></header>
    {!room ? <>
      <p className="panel-note">Up to eight karts and sixteen humans. Share an invite, pick a seat, and race. No accounts.</p>
      <button data-pad className="game-primary" disabled={online.busy} onClick={() => void online.connect()}>Create a room</button>
      <form className="room-join" onSubmit={event => { event.preventDefault(); void online.connect(invitation); }}>
        <label>Room code or invite link<input data-pad value={invitation} onChange={event => setInvitation(event.currentTarget.value)} maxLength={256} autoComplete="off" spellCheck={false} placeholder="ABCDEFGH" /></label>
        <button data-pad type="submit" disabled={online.busy || !invitation.trim()}>Join room</button>
      </form>
    </> : <>
      <div className="room-invite"><div><span>Room code</span><strong>{room.code}</strong><small>{online.status} / {online.peers.size} direct connection{online.peers.size === 1 ? "" : "s"}</small></div>
        <button data-pad disabled={online.busy} onClick={() => void online.operation(async () => {
          if (!network) throw new Error("The room is disconnected.");
          await navigator.clipboard.writeText(network.connection.inviteUrl);
          setCopied(true);
        })}>{copied ? "Link copied" : "Copy invite link"}</button>
        <input aria-label="Invite link" readOnly value={network?.connection.inviteUrl ?? ""} onFocus={event => event.currentTarget.select()} />
      </div>
      {room.reason && <p className="panel-note" role="status">{room.reason}</p>}
      <div className="race-option-pair">
        <Choice label="Your local player" value={id} options={players.map((player, index) => ({ value: player.id, label: `P${index + 1} - ${player.name}` }))} change={setSelected} />
        <button data-pad disabled={online.busy || !lobby || !playerId} onClick={() => void online.operation(async () => {
          if (!network || !playerId) throw new Error("Choose a local player.");
          await network.connection.seat(playerId, null);
        })}>Spectate instead</button>
      </div>
      <div className="room-karts">{room.karts.map((kart, index) => {
        const own = kart.seats.some(seat => seat && member?.players.some(player => player.id === seat));
        return <article className="room-kart" key={index} data-local={own}>
          <header><b>Kart {index + 1}</b><span>{BODIES.find(body => body.id === kart.build.body)?.name}</span></header>
          <div className="room-seats">{kart.seats.map((occupant, side) => {
            const player = allPlayers.find(player => player.id === occupant);
            const owner = room.participants.find(participant => participant.players.some(player => player.id === occupant));
            return <button data-pad key={side} disabled={online.busy || !lobby || !!occupant && occupant !== playerId}
              data-ready={player?.ready ?? false} data-selected={occupant === playerId}
              onClick={() => void online.operation(() => seat(index, side === 0 ? 0 : 1))}>
              <span>{CHARACTERS.find(character => character.id === kart.build.characters[side])?.name}</span>
              <strong>{player?.name ?? "Take this seat"}</strong>
              <small>{!owner?.connected && occupant ? "Reserved - reconnecting" : player?.ready ? "Ready" : occupant ? "Not ready" : side === 0 ? "Starts driving" : "Starts in the back"}</small>
            </button>;
          })}</div>
          {own && <button data-pad disabled={online.busy || !lobby} onClick={() => {
            const profile = [...identities].find(([, remote]) => kart.seats.includes(remote))?.[0];
            if (profile) garage(profile);
          }}>Change this kart</button>}
        </article>;
      })}</div>
      {room.series && <CircuitStandings series={room.series} ownKarts={online.ownKartIds()} />}
      {host && lobby && !room.series ? <div className="room-rules">
        <Choice<Exclude<RaceProgram, "time-trial">> label="Program" value={program}
          options={[{ value: "quick", label: "Single race" }, ...CUPS.filter(cup => availableSeries(cup.courses)).map(cup => ({ value: cup.id, label: cup.name }))]}
          change={next => {
            if (next === "quick") configure({ mode: "quick" });
            else configure({ mode: next === "tour" ? "tour" : "cup", cup: next === "horizon" ? "horizon" : "town",
              course: CUPS.find(cup => cup.id === next)!.courses[0] });
          }} />
        {program === "quick" ? <Choice label="Course" value={room.config.course} options={COURSES.filter(course => course.available).map(course => ({ value: course.id, label: course.name }))}
          change={course => configure({ course })} /> :
          <p className="panel-note">{CUPS.find(cup => cup.id === program)!.courses.map(id => COURSES.find(course => course.id === id)!.name).join(" / ")}</p>}
        <Choice label="Class" value={room.config.speed} options={[{ value: 50, label: "50" }, { value: 100, label: "100" }, { value: 150, label: "150" }]} change={speed => configure({ speed })} />
        <Toggle label="Mirror" value={room.config.mirror} change={mirror => configure({ mirror })} />
        <Toggle label="Fill empty karts with bots" value={room.config.bots} change={bots => configure({ bots })} />
        {room.config.bots && <Choice label="Bot difficulty" value={room.config.difficulty} options={[{ value: "easy", label: "Easy" }, { value: "normal", label: "Normal" }, { value: "hard", label: "Hard" }]} change={difficulty => configure({ difficulty })} />}
      </div> : <p className="panel-note">{COURSES.find(course => course.id === room.config.course)?.name} / {room.config.speed} / {room.config.mirror ? "Mirror" : "Normal"}. {room.series ? "Circuit rules stay fixed. Points belong to kart slots; new arrivals may join a slot for the next course." : lobby ? "The host chooses the race." : "Late arrivals spectate until the next race."}</p>}
      <div className="room-start">
        <button data-pad className="game-primary" disabled={online.busy || !lobby || !seated.length} onClick={() => void online.toggleReady()}>{ready ? "Not ready" : "Ready to race"}</button>
        {host && <button data-pad className="game-primary" disabled={online.busy || !lobby || !allReady} onClick={() => void online.operation(async () => {
          if (!network) throw new Error("The room is disconnected.");
          await network.connection.start();
        })}>Start race</button>}
        {host && (!lobby || room.series) && <button data-pad disabled={online.busy} onClick={() => void online.operation(async () => {
          if (!network) throw new Error("The room is disconnected.");
          await network.connection.returnToLobby();
        })}>{room.series ? "End circuit and change rules" : "Return everyone to the room"}</button>}
        <button data-pad disabled={online.busy} onClick={() => network?.retryConnections()}>Retry connection</button>
      </div>
    </>}
    <h2>On this couch</h2>
    <div className="online-local-players">{players.map((player, index) => <article key={player.id} className="local-player-card">
      <strong>P{index + 1} - {player.name}</strong>
      <p>{!player.connected ? "Controller disconnected" : player.device.kind === "gamepad" ? player.device.id : player.device.kind === "keyboard" ? "Keyboard" : "Choose a controller or keyboard"}</p>
      <div className="player-actions"><button data-pad onClick={() => capture(player.id)}>Connect controller</button>
        <button data-pad onClick={() => keyboard(player.id)}>Use keyboard</button><button data-pad onClick={() => controls(player.id)}>Controls</button></div>
    </article>)}</div>
    {players.length < 4 && (!room || lobby) && <button data-pad disabled={online.busy} onClick={addPlayer}>Add a couch player</button>}
    <p className="development-note">Direct connections only for now. Some networks need a relay; that fallback remains off until the total-cost cap is enforceable. There is no paid connection fallback.</p>
  </section>;
}
