import { useEffect, useRef, useState } from "react";
import { parseRaceState } from "@kartsick/simulation";
import type { RaceEvent, RaceState } from "@kartsick/simulation";
import type { Room } from "@kartsick/protocol";
import type { LocalPlayer } from "./local-input";
import { KartsickNetwork } from "./network";
import type { RaceRuntime } from "./race-runtime";
import { decodeRaceEventBatch } from "./online-race";

interface RoomCallbacks {
  game(): RaceRuntime | null;
  players(): readonly LocalPlayer[];
  ensurePlayers(count: number): void;
  connected(): void;
  started(): void;
  lobby(): void;
  left(): void;
  warning(message: string): void;
  failure(message: string): void;
}
export function useOnlineRoom(callbacks: RoomCallbacks) {
  const current = useRef(callbacks);
  current.current = callbacks;
  const network = useRef<KartsickNetwork<RaceState, RaceEvent[]> | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);
  const alive = useRef(true);
  const busyRef = useRef(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("No room joined");
  const [peers, setPeers] = useState<ReadonlySet<string>>(new Set());

  function identities(value = network.current?.room): ReadonlyMap<string, string> {
    if (!value || !network.current) return new Map();
    const own = value.participants.find(participant => participant.id === network.current!.participantId);
    return new Map(current.current.players().flatMap((player, index) => own?.players[index] ? [[player.id, own.players[index].id]] : []));
  }
  async function operation(action: () => Promise<void>): Promise<void> {
    if (busyRef.current) { current.current.warning("Wait for the current room operation to finish."); return; }
    busyRef.current = true;
    setBusy(true);
    try { await action(); }
    catch (error) { if (alive.current) current.current.warning(error instanceof Error ? error.message : String(error)); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  async function connect(invitation?: string): Promise<void> {
    await operation(async () => {
      if (network.current) throw new Error("Leave your current room before joining another.");
      const settings = {
        names: current.current.players().map(player => player.name), decodeState: parseRaceState, decodeEvent: decodeRaceEventBatch,
        stunUrls: ["127.0.0.1", "localhost"].includes(location.hostname) ? [] : undefined,
        restoreCheckpoint: (checkpoint: Parameters<RaceRuntime["restoreOnline"]>[0]) => {
          const game = current.current.game();
          if (!game) throw new Error("The game renderer is not ready for checkpoint restoration.");
          game.restoreOnline(checkpoint);
        },
      };
      const value = invitation ? await KartsickNetwork.join<RaceState, RaceEvent[]>(invitation, settings) : await KartsickNetwork.create<RaceState, RaceEvent[]>(settings);
      if (!alive.current) { value.dispose(); return; }
      network.current = value;
      current.current.game()?.setOnlineLobby(true);
      const member = value.room?.participants.find(participant => participant.id === value.participantId);
      if (member) current.current.ensurePlayers(member.players.length);
      current.current.connected();
      setStatus("Connected to room");
      let activeRace = false;
      let lastPhase: Room["phase"] | null = null;
      unsubscribe.current = value.subscribe(event => {
        if (!alive.current || network.current !== value) return;
        if (event.type === "error") current.current.warning(event.error.message);
        if (event.type === "signaling") setStatus(event.status === "connected" ? "Connected to room" : event.status === "reconnecting" ? "Reconnecting to room" : "Room disconnected");
        if (event.type === "peer") setPeers(previous => {
          const next = new Set(previous);
          if (event.status === "connected") next.add(event.participantId);
          else next.delete(event.participantId);
          return next;
        });
        if (event.type !== "room") return;
        setRoom(event.room);
        if (event.room.phase === "lobby") {
          activeRace = false;
          if (lastPhase !== null && lastPhase !== "lobby") {
            current.current.lobby();
            if (event.room.reason) current.current.warning(event.room.reason);
          }
        } else if (event.room.phase === "racing" && !activeRace) {
          activeRace = true;
          const game = current.current.game();
          if (!game) { current.current.failure("The room started before the game was ready."); return; }
          current.current.started();
          void game.startOnline(value, identities(event.room)).catch(error => {
            current.current.failure(error instanceof Error ? error.message : String(error));
            void value.leave().catch(error => current.current.warning(`Room departure failed: ${String(error)}`));
          });
        }
        lastPhase = event.room.phase;
      });
    });
  }
  async function leave(): Promise<void> {
    await operation(async () => {
      const value = network.current;
      unsubscribe.current?.();
      unsubscribe.current = null;
      network.current = null;
      try { if (value) await value.leave(); }
      finally {
        if (alive.current) {
          setRoom(null);
          setPeers(new Set());
          setStatus("No room joined");
          current.current.game()?.setOnlineLobby(false);
          current.current.left();
        }
      }
    });
  }
  async function toggleReady(): Promise<void> {
    await operation(async () => {
      const value = network.current, game = current.current.game();
      const active = value?.room;
      if (!value || !game || !active) throw new Error("Join a room before readying.");
      const own = active.participants.find(participant => participant.id === value.participantId);
      const seated = own?.players.filter(player => active.karts.some(kart => kart.seats.includes(player.id))) ?? [];
      if (!seated.length) throw new Error("Choose a seat before readying.");
      const ready = !seated.every(player => player.ready);
      if (ready) {
        const missing = current.current.players().filter(player => seated.some(seat => seat.id === identities(active).get(player.id)))
          .some(player => !player.connected || player.device.kind === "unassigned");
        if (missing) throw new Error("Connect your controllers or choose the keyboard before readying.");
        await game.prepareOnline(active, identities(active));
        await value.connection.syncClock();
      }
      for (const player of seated) await value.connection.ready(player.id, ready);
    });
  }

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      unsubscribe.current?.();
      network.current?.dispose();
      network.current = null;
    };
  }, []);
  return { network, room, busy, status, peers, identities, operation, connect, leave, toggleReady };
}
