import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BODIES, CHARACTERS, COURSES, CUPS, GLIDERS, ITEMS, WHEELS, availableSeries, combinedStats, getCourse } from "@kartsick/content";
import { appendSeriesRound, copyRace, createSeries, nextSeriesCourse, seriesMedal } from "@kartsick/simulation";
import type { RaceOptions, RaceState, SeriesProgress } from "@kartsick/simulation";
import type { MenuAction } from "./input";
import type { GameSettings } from "./game-controls";
import { freshGame, keepMedal, keepRecord, loadGame, recordKey, saveGame } from "./game-storage";
import type { GameSave, PlayerProfile } from "./game-storage";
import { GHOST_STORAGE_KEY, loadGhosts, saveGhost } from "./ghosts";
import type { GhostRecorder } from "./ghosts";
import type { LocalDevice, LocalPlayer } from "./local-input";
import { localEntries } from "./local-race";
import { RaceRuntime } from "./race-runtime";
import type { RaceMode } from "./race-runtime";
import { GameHud, updateGameHud } from "./ui/game-hud";
import type { HudView } from "./ui/game-hud";
import { Garage } from "./ui/garage";
import { ItemSymbols } from "./ui/item-icons";
import { navigateMenu } from "./ui/menu-controls";
import { RaceMiniMap, mapGeometry, updateRaceMap } from "./ui/minimap";
import { RaceResults, RaceSetup } from "./ui/race-setup";
import type { RaceProgram } from "./ui/race-setup";
import { RecordsPanel } from "./ui/records";
import { ControlsPanel, GameSettingsPanel } from "./ui/settings";
import { OnlineLobby } from "./ui/online-lobby";
import { useOnlineRoom } from "./use-online-room";
import "./game.css";

type Page = "home" | "setup" | "garage" | "controls" | "settings" | "records" | "online";
const catalog = { characters: CHARACTERS, bodies: BODIES, wheels: WHEELS, gliders: GLIDERS, items: ITEMS, handling: combinedStats };
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const defaults = (): RaceOptions => ({ courseId: "butterbell", mode: "race", speedClass: 100, mirror: false, bots: true, difficulty: "normal", seed: seed() });
const courseNames = Object.fromEntries(COURSES.map(course => [course.id, course.name]));

function openGameStorage() {
  try {
    const storage = window.localStorage;
    return { ...loadGame(storage), storage };
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
    return { data: freshGame(), warning: "Local storage is blocked. You can play, but this visit cannot be saved.", canWrite: false, storage: null };
  }
}

function App(): React.JSX.Element {
  const [loaded] = useState(openGameStorage);
  const [data, setData] = useState(loaded.data);
  const [canWrite, setCanWrite] = useState(loaded.canWrite);
  const [warning, setWarning] = useState<string | null>(loaded.warning);
  const [audioActivation, setAudioActivation] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [mode, setMode] = useState<RaceMode>("loading");
  const [page, setPage] = useState<Page>("home");
  const [returnPage, setReturnPage] = useState<Page>("home");
  const [selectedProfile, setSelectedProfile] = useState("local-1");
  const [pauseReason, setPauseReason] = useState("Take a breather.");
  const [remapNotice, setRemapNotice] = useState<string | null>(null);
  const [options, setOptions] = useState(defaults);
  const [program, setProgram] = useState<RaceProgram>("quick");
  const [series, setSeries] = useState<SeriesProgress | null>(null);
  const seriesRef = useRef(series);
  seriesRef.current = series;
  const [assignments, setAssignments] = useState<Record<string, number>>({ "local-1": 0, "local-2": 1, "local-3": 2, "local-4": 3 });
  const [players, setPlayers] = useState<LocalPlayer[]>(() => [{
    id: loaded.data.profiles[0].id, name: loaded.data.profiles[0].name, calibration: loaded.data.profiles[0].calibration, device: { kind: "unassigned" }, connected: true,
  }]);
  const [views, setViews] = useState<HudView[]>([]);
  const [mapRace, setMapRace] = useState<RaceState | null>(null);
  const [result, setResult] = useState<RaceState | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [ghosts, setGhosts] = useState(() => loaded.storage ? loadGhosts(loaded.storage) : { ghosts: [], warning: null });
  const [debug, setDebug] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const runtime = useRef<RaceRuntime | null>(null);
  const saveRef = useRef(data);
  const playersRef = useRef(players);
  const writableRef = useRef(canWrite);
  const mapRef = useRef(mapGeometry(getCourse()));
  const actions = useRef<(action: MenuAction, playerId: string) => void>(() => {});
  const finishAction = useRef<(race: RaceState, recorder: GhostRecorder | null) => void>(() => {});
  const joinAction = useRef<(device: LocalDevice) => void>(() => {});
  const commitPlayersAction = useRef<(players: LocalPlayer[]) => void>(() => {});
  const inviteAttempted = useRef(false);
  saveRef.current = data;
  playersRef.current = players;
  writableRef.current = canWrite;
  const online = useOnlineRoom({
    game: () => runtime.current, players: () => playersRef.current,
    ensurePlayers(count) {
      const next = [...playersRef.current];
      for (const profile of saveRef.current.profiles) {
        if (next.length >= count) break;
        if (!next.some(player => player.id === profile.id)) next.push({
          id: profile.id, name: profile.name, calibration: profile.calibration, connected: false, device: { kind: "unassigned" },
        });
      }
      commitPlayers(next);
    },
    connected: () => { setPage("online"); setReturnPage("online"); },
    started: () => { setPage("home"); setResult(null); setResultMessage(null); seriesRef.current = null; setSeries(null); },
    lobby: () => {
      const profile = saveRef.current.profiles.find(profile => profile.id === playersRef.current[0].id)!;
      runtime.current?.menu(profile.build, profile.name);
      setPage("online");
      setResult(null);
    },
    left: () => goHome(), warning: setWarning, failure: setFailure,
  });

  function commitPlayers(next: LocalPlayer[]): void {
    const updated = next.map(player => {
      const profile = saveRef.current.profiles.find(profile => profile.id === player.id)!;
      return { ...player, name: profile.name, calibration: profile.calibration };
    });
    playersRef.current = updated;
    runtime.current?.setPlayers(updated);
    setPlayers(updated);
  }
  commitPlayersAction.current = commitPlayers;

  function save(next: GameSave): boolean {
    saveRef.current = next;
    setData(next);
    if (writableRef.current && loaded.storage) {
      const problem = saveGame(loaded.storage, next);
      if (problem) setWarning(problem);
      return problem === null;
    }
    return false;
  }
  function settings(next: GameSettings): void {
    runtime.current?.applySettings(next);
    save({ ...saveRef.current, settings: next });
  }
  function profileChange(id: string, patch: Partial<Omit<PlayerProfile, "id">>): void {
    const profiles = saveRef.current.profiles.map(profile => profile.id === id ? { ...profile, ...patch } : profile);
    save({ ...saveRef.current, profiles });
    commitPlayers(playersRef.current);
    if (patch.build && id === selectedProfile) runtime.current?.preview(patch.build, profiles.find(profile => profile.id === id)!.name);
  }

  function addPlayer(device: LocalDevice = { kind: "unassigned" }): void {
    const profile = saveRef.current.profiles.find(profile => !playersRef.current.some(player => player.id === profile.id));
    if (!profile) { setWarning("Four local players are already in the game."); return; }
    const available = [0, 1, 2, 3].find(kart => !playersRef.current.some(player => assignments[player.id] === kart));
    if (available === undefined) throw new Error("A free local kart could not be assigned.");
    setAssignments(previous => ({ ...previous, [profile.id]: available }));
    commitPlayers([...playersRef.current, { id: profile.id, name: profile.name, calibration: profile.calibration, device, connected: true }]);
  }
  joinAction.current = addPlayer;

  function addCouchPlayer(): void {
    if (!online.network.current) { addPlayer(); return; }
    void online.operation(async () => {
      const previous = playersRef.current;
      addPlayer();
      try { await online.network.current!.connection.updatePlayers(playersRef.current.map(player => player.name)); }
      catch (error) { commitPlayers(previous); throw error; }
    });
  }

  function showPage(next: Page, profileId = selectedProfile): void {
    runtime.current?.input.cancelRemap();
    setReturnPage(page === "garage" || page === "controls" || page === "settings" || page === "records" ? returnPage : page);
    setSelectedProfile(profileId);
    setPage(next);
    if (next === "garage") {
      const profile = saveRef.current.profiles.find(profile => profile.id === profileId)!;
      runtime.current?.preview(profile.build, profile.name);
    }
  }
  function back(): void {
    runtime.current?.input.cancelRemap();
    if (page === "garage" && returnPage === "online" && online.network.current?.room?.phase === "lobby") {
      void online.operation(async () => {
        const network = online.network.current;
        const playerId = online.identities().get(selectedProfile);
        const index = network?.room?.karts.findIndex(kart => playerId && kart.seats.includes(playerId)) ?? -1;
        if (!network || index < 0) throw new Error("Choose a seat before changing its shared kart.");
        const profile = saveRef.current.profiles.find(profile => profile.id === selectedProfile)!;
        await network.connection.setBuild(index, profile.build);
        setPage("online");
      });
      return;
    }
    setPage(page === "setup" ? "home" : returnPage);
    const profile = saveRef.current.profiles.find(profile => profile.id === playersRef.current[0].id)!;
    if (page === "garage") runtime.current?.preview(profile.build, profile.name);
  }

  async function startRace(): Promise<void> {
    const game = runtime.current;
    if (!game) return;
    if (playersRef.current.length === 1 && playersRef.current[0].device.kind === "unassigned") game.input.bindKeyboard(playersRef.current[0].id);
    const entries = localEntries(saveRef.current.profiles, playersRef.current, assignments);
    const circuit = CUPS.find(cup => cup.id === program);
    if (circuit && !availableSeries(circuit.courses)) { setWarning("The circuit's remaining courses are still in production."); return; }
    const progress = circuit ? createSeries(circuit.id) : null;
    seriesRef.current = progress;
    setSeries(progress);
    const next = { ...options, courseId: progress ? nextSeriesCourse(progress)! : options.courseId, seed: seed() };
    const key = recordKey(playersRef.current[0].id, next.courseId, getCourse(next.courseId).version, next.speedClass, next.mirror);
    const ghost = ghosts.ghosts.find(ghost => ghost.key === key) ?? null;
    setResult(null);
    setResultMessage(null);
    setPage("home");
    try { await game.start(next, entries, ghost); }
    catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
      game.dispose();
    }
  }

  async function nextRound(): Promise<void> {
    const game = runtime.current, progress = seriesRef.current;
    if (!game || !progress || !result) throw new Error("There is no completed circuit round to continue.");
    const courseId = nextSeriesCourse(progress);
    if (!courseId) throw new Error("This circuit is already complete.");
    setResult(null);
    setResultMessage(null);
    try {
      await game.start({ ...result.options, courseId, seed: seed() }, result.karts.map(kart => ({
        id: kart.id, name: kart.name, build: kart.build, players: kart.players,
      })));
    } catch (error) { setFailure(error instanceof Error ? error.message : String(error)); game.dispose(); }
  }

  function goHome(nextPage: "home" | "setup" = "home"): void {
    if (online.network.current) { void online.leave(); return; }
    const profile = saveRef.current.profiles.find(profile => profile.id === playersRef.current[0].id)!;
    runtime.current?.menu(profile.build, profile.name);
    setPage(nextPage);
    setReturnPage("home");
    setResult(null);
    seriesRef.current = null;
    setSeries(null);
  }

  finishAction.current = (race, recorder) => {
    setResult(race);
    setPage("home");
    const localIds = runtime.current?.localPlayerIds ?? new Set(playersRef.current.map(player => player.id));
    const own = new Set(race.karts.filter(kart => kart.players.some(id => id !== null && localIds.has(id))).map(kart => kart.id));
    if (race.options.mode === "race") {
      let next = { ...saveRef.current, races: saveRef.current.races + 1, wins: saveRef.current.wins + Number(race.results.some(result => result.position === 1 && own.has(result.id) && result.finished)) };
      let medal: ReturnType<typeof seriesMedal> = null;
      if (seriesRef.current) {
        const progress = appendSeriesRound(seriesRef.current, race);
        seriesRef.current = progress;
        setSeries(progress);
        medal = seriesMedal(progress, own);
        if (medal) next = keepMedal(next, { cup: progress.cup, speedClass: race.options.speedClass, mirror: race.options.mirror, ...medal });
        else if (!nextSeriesCourse(progress)) setResultMessage("Circuit complete. Finish every course and place in the top three to earn a medal.");
      }
      const persisted = save(next);
      if (medal) setResultMessage(`${medal.medal[0].toUpperCase() + medal.medal.slice(1)} medal${persisted ? " saved to the trophy shelf!" : " for this visit. Browser saving is unavailable."}`);
      return;
    }
    const kart = race.karts.find(kart => own.has(kart.id));
    if (!kart?.state.finished) { setResultMessage("This run was incomplete. No time-trial record was saved."); return; }
    const profileId = kart.players.find((id): id is string => id !== null && localIds.has(id));
    if (!profileId) throw new Error("The time trial has no local profile.");
    const courseVersion = getCourse(race.options.courseId).version;
    const key = recordKey(profileId, race.options.courseId, courseVersion, race.options.speedClass, race.options.mirror);
    const kept = keepRecord(saveRef.current, {
      key, profileId, courseId: race.options.courseId, courseVersion, speedClass: race.options.speedClass, mirror: race.options.mirror,
      time: kart.state.elapsed, bestLap: Math.min(...kart.state.lapTimes), build: kart.build, date: Date.now(),
    });
    const persisted = save(kept.save);
    if (!kept.improved) { setResultMessage("Run complete. Your faster record is still on the shelf."); return; }
    if (!persisted || !loaded.storage) { setResultMessage("New best time for this visit. Browser saving is unavailable."); return; }
    const ghost = recorder?.finish(key, kart.build, kart.state.elapsed);
    if (!ghost) { setResultMessage("New best time. This run was too long to store a complete ghost."); return; }
    const problem = saveGhost(loaded.storage, ghost);
    setGhosts(loadGhosts(loaded.storage));
    setResultMessage(problem ?? "New best time! Your ghost is ready for the next run.");
  };

  useEffect(() => {
    if (!canvas.current) return;
    let game: RaceRuntime | null = null;
    let cancelled = false;
    try {
      const profile = saveRef.current.profiles[0];
      game = new RaceRuntime(canvas.current, saveRef.current.settings, { id: "preview", name: profile.name, build: profile.build, players: [profile.id, null] }, {
        mode(next, reason) { setMode(next); if (reason) setPauseReason(reason); },
        menu: (action, id) => actions.current(action, id),
        device: (id, device) => commitPlayersAction.current(playersRef.current.map(player => player.id === id ? { ...player, device, connected: true } : player)),
        join: device => joinAction.current(device),
        disconnect: id => commitPlayersAction.current(playersRef.current.map(player => player.id === id ? { ...player, connected: false } : player)),
        warning: setWarning, rebound: next => { runtime.current?.applySettings(next); save({ ...saveRef.current, settings: next }); },
        remapNotice: setRemapNotice, audioActivation: setAudioActivation, failure: setFailure,
        views(next) {
          setViews(next);
          queueMicrotask(() => {
            if (cancelled || !runtime.current) return;
            const race = copyRace(runtime.current.state);
            mapRef.current = mapGeometry(getCourse(race.options.courseId, race.options.mirror));
            setMapRace(race);
          });
        },
        frame(frame, race) {
          if (hud.current) { updateGameHud(hud.current, frame); updateRaceMap(hud.current, mapRef.current, race); }
          for (const node of document.querySelectorAll<HTMLElement>("[data-calibration]")) {
            const sample = runtime.current?.input.axisSamples.get(node.dataset.calibration ?? "");
            const dot = node.querySelector<HTMLElement>("[data-stick-dot]");
            const label = node.querySelector<HTMLOutputElement>("[data-stick-value]");
            if (sample && dot) { dot.style.left = `${50 + sample.x * 42}%`; dot.style.top = `${50 + sample.y * 42}%`; }
            if (label) label.textContent = sample ? `Raw ${sample.rawX.toFixed(2)}, ${sample.rawY.toFixed(2)} / calibrated ${sample.x.toFixed(2)}, ${sample.y.toFixed(2)}` : "Connect a controller and move its left stick.";
          }
        },
        finished: (race, recorder) => finishAction.current(race, recorder),
      });
      runtime.current = game;
      game.setPlayers(playersRef.current);
      if (import.meta.env.DEV) {
        const owned = game;
        Object.defineProperty(window, "__KARTSICK_RACE__", { value: { read: () => owned.snapshot() }, configurable: true });
      }
      void game.ready().catch(error => {
        if (!cancelled) { setFailure(error instanceof Error ? error.message : String(error)); game?.dispose(); }
      });
    } catch (error) { setFailure(error instanceof Error ? error.message : String(error)); game?.dispose(); }
    const key = (event: KeyboardEvent) => { if (event.code === "F3") { event.preventDefault(); setDebug(value => !value); } };
    window.addEventListener("keydown", key);
    return () => { cancelled = true; game?.dispose(); runtime.current = null; Reflect.deleteProperty(window, "__KARTSICK_RACE__"); window.removeEventListener("keydown", key); };
  }, []);

  useEffect(() => {
    if (mode === "race") canvas.current?.focus();
    else document.querySelector<HTMLElement>("[data-game-menu] [data-pad]")?.focus();
  }, [mode, page]);

  useEffect(() => {
    if (mode !== "menu" || inviteAttempted.current) return;
    inviteAttempted.current = true;
    const invitation = new URL(location.href).searchParams.get("room");
    if (invitation) { setPage("online"); void online.connect(invitation); }
  }, [mode]);

  useEffect(() => {
    if (ghosts.warning) setWarning(previous => [previous, ghosts.warning].filter(Boolean).join(" "));
  }, [ghosts.warning]);

  actions.current = action => {
    if (mode === "race") { if (action === "pause") { setPage("home"); runtime.current?.pause(); } return; }
    if (mode === "loading" || failure) return;
    if (action === "back") {
      if (page === "online") { if (online.room) void online.leave(); else setPage("home"); }
      else if (page !== "home") back();
      else if (mode === "paused") runtime.current?.resume();
      return;
    }
    navigateMenu(action);
  };

  function resetSave(): void {
    if (!loaded.storage) { setWarning("This browser still blocks local storage. Allow storage before resetting the saved game."); return; }
    const next = freshGame();
    const problem = saveGame(loaded.storage, next);
    if (problem) { setWarning(problem); return; }
    writableRef.current = true;
    setCanWrite(true);
    save(next);
    runtime.current?.applySettings(next.settings);
    commitPlayers(playersRef.current);
    try {
      loaded.storage.removeItem(GHOST_STORAGE_KEY);
      setGhosts({ ghosts: [], warning: null });
      setWarning("Local game data reset. The old driving-study save was left untouched.");
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      setWarning("The game save was reset, but the browser could not remove its old ghosts.");
    }
  }

  const profile = data.profiles.find(profile => profile.id === selectedProfile)!;
  const selectedPlayer = players.find(player => player.id === selectedProfile);
  const family = selectedPlayer?.device.kind === "gamepad" ? selectedPlayer.device.family : "generic";
  const localIds = runtime.current?.localPlayerIds ?? new Set(players.map(player => player.id));
  const ownKarts = new Set(mapRace?.karts.filter(kart => kart.players.some(id => id !== null && localIds.has(id))).map(kart => kart.id) ?? []);
  const overlay = mode !== "race" && mode !== "loading" && !failure;
  const firstProfile = data.profiles.find(profile => profile.id === players[0].id)!;

  return <main className="kartsick" data-driving={mode === "race"} data-motion={data.settings.reducedMotion ? "reduced" : "normal"} data-debug={debug}>
    <canvas ref={canvas} className="game-canvas" tabIndex={-1} aria-label="Kartsick 3D racing views" /><div className="game-vignette" /><ItemSymbols />
    <GameHud views={views} visible={mode === "race" || mode === "paused"} rootRef={hud} pause={() => { setPage("home"); runtime.current?.pause(); }}
      map={mapRace && <RaceMiniMap geometry={mapRef.current} racers={mapRace.karts} own={ownKarts} />} />
    {mode === "race" && online.room && ownKarts.size === 0 && <button className="race-spectate" onClick={() => runtime.current?.cycleSpectator()}>Watch next kart</button>}
    <div className="game-alerts">
      {warning && <div className="game-alert" role="alert"><span>{warning}</span><button onClick={() => setWarning(null)}>Close</button></div>}
      {audioActivation && <div className="game-alert" role="status"><span>Your browser needs a click for audio. Controllers and racing still work.</span><button onClick={() => runtime.current?.enableSound()}>Enable sound</button></div>}
      {remapNotice && page !== "controls" && <div className="game-alert" role="status"><span>{remapNotice}</span><button onClick={() => runtime.current?.input.cancelRemap()}>Cancel</button></div>}
    </div>
    {failure ? <section className="game-panel pause-panel" role="alert"><p className="pit-label">The race stopped</p><h1>Let's get you rolling.</h1><p>{failure}</p>
      <button className="game-primary" onClick={() => location.reload()}>Reload game</button></section> :
      mode === "loading" && <div className="game-loading"><h1 className="game-wordmark">KARTSICK</h1><p>Getting the karts onto the course...</p><progress aria-label="Loading race" /></div>}
    {overlay && page === "home" && mode === "menu" && <>
      <section className="game-home" data-game-menu aria-label="Main menu"><p className="pit-label">Belltumble motor club / Development build</p>
        <h1 className="game-wordmark">KARTSICK</h1><h2>Bring a friend.<br />Blame the other driver.</h2><p>Two riders. One kart. Questionable decisions.</p>
        <nav className="home-actions">
          <button data-pad onClick={() => { setProgram("quick"); setOptions(previous => ({ ...previous, mode: "race", bots: true })); setPage("setup"); }}><span>Quick race</span><small>Races, cups and couch play</small></button>
          <button data-pad onClick={() => { setProgram("time-trial"); setOptions(previous => ({ ...previous, mode: "time-trial", bots: false })); setPage("setup"); }}><span>Time trials</span><small>You versus your ghost</small></button>
          <button data-pad onClick={() => { setPage("online"); setReturnPage("online"); }}><span>Online race</span><small>Invite your friends</small></button>
          <button data-pad onClick={() => showPage("garage", firstProfile.id)}><span>Garage</span><small>All riders and parts</small></button>
          <button data-pad onClick={() => showPage("records")}><span>Local records</span><small>Times and medals</small></button>
        </nav>
        <div className="home-links"><button data-pad onClick={() => showPage("controls", firstProfile.id)}>Controls</button><button data-pad onClick={() => showPage("settings")}>Settings</button><a href="/licenses/" target="_blank" rel="noreferrer">Credits</a></div>
      </section>
      <aside className="home-kart-label"><p className="pit-label">{firstProfile.name}'s crew</p><strong>{firstProfile.build.characters.map(id => CHARACTERS.find(character => character.id === id)?.name).join(" + ")}</strong>
        <small>{BODIES.find(body => body.id === firstProfile.build.body)?.name} / {WHEELS.find(wheels => wheels.id === firstProfile.build.wheels)?.name}</small></aside>
      <footer className="game-footer"><span>Press a controller button to connect. Keyboard works too.</span><span>Original game, art and sound. <a href="?study">Driving study</a></span></footer>
    </>}
    {overlay && page === "setup" && <RaceSetup options={options} changeOptions={setOptions} program={program}
      changeProgram={program => { setProgram(program); setOptions(previous => ({ ...previous, mode: program === "time-trial" ? "time-trial" : "race", bots: program !== "time-trial" })); }}
      players={players} assignments={assignments}
      assign={(id, kart) => setAssignments(previous => ({ ...previous, [id]: kart }))} rename={(id, name) => profileChange(id, { name })}
      capture={id => runtime.current?.input.captureDevice(id)} keyboard={id => runtime.current?.input.bindKeyboard(id)} addPlayer={() => addPlayer()}
      removePlayer={id => commitPlayers(playersRef.current.filter(player => player.id !== id))}
      garage={id => {
        const owner = players.find(player => assignments[player.id] === assignments[id])!;
        showPage("garage", owner.id);
      }} controls={id => showPage("controls", id)} start={() => void startRace()} close={() => setPage("home")} />}
    {overlay && page === "online" && <OnlineLobby online={online} players={players}
      build={id => data.profiles.find(profile => profile.id === id)!.build} garage={id => showPage("garage", id)}
      controls={id => showPage("controls", id)} capture={id => runtime.current?.input.captureDevice(id)}
      keyboard={id => runtime.current?.input.bindKeyboard(id)} addPlayer={addCouchPlayer} back={() => setPage("home")} />}
    {overlay && page === "garage" && <Garage build={profile.build} playerName={profile.name} catalog={catalog} presets={data.presets} change={build => profileChange(profile.id, { build })}
      savePreset={(name, build) => save({ ...saveRef.current, presets: [...saveRef.current.presets, { name, build: structuredClone(build) }] })}
      removePreset={index => save({ ...saveRef.current, presets: saveRef.current.presets.filter((_, i) => i !== index) })} close={back} />}
    {overlay && page === "settings" && <GameSettingsPanel settings={data.settings} change={settings} close={back} canWrite={canWrite} resetSave={resetSave} />}
    {overlay && page === "controls" && <ControlsPanel settings={data.settings} change={settings} profile={profile} family={family} calibration={profile.calibration ?? data.settings}
      setCalibration={calibration => profileChange(profile.id, { calibration })} remapNotice={remapNotice}
      remapKey={action => runtime.current?.input.startRemap("key", action)} remapButton={action => runtime.current?.input.startRemap("button", action)}
      cancelRemap={() => runtime.current?.input.cancelRemap()} close={back} />}
    {overlay && page === "records" && <RecordsPanel save={data} close={back} courseNames={courseNames} ghostKeys={new Set(ghosts.ghosts.map(ghost => ghost.key))} />}
    {overlay && page === "home" && mode === "paused" && <section className="game-panel pause-panel" data-game-menu aria-label="Pause menu"><p className="pit-label">Pit stop</p><h1>{runtime.current?.online ? "You're in the pits." : "Race paused."}</h1><p>{pauseReason}</p>
      {players.filter(player => !player.connected).map(player => <div className="local-player-card" key={player.id}><strong>{player.name}: controller disconnected</strong><div className="player-actions">
        <button data-pad onClick={() => runtime.current?.input.captureDevice(player.id)}>Reconnect controller</button><button data-pad onClick={() => runtime.current?.input.bindKeyboard(player.id)}>Use keyboard</button></div></div>)}
      <div className="pause-actions"><button data-pad className="game-primary" onClick={() => runtime.current?.resume()}>Resume</button>
        {online.room && ownKarts.size === 0 && <button data-pad onClick={() => runtime.current?.cycleSpectator()}>Watch next kart</button>}
        <button data-pad onClick={() => showPage("controls", firstProfile.id)}>Controls</button><button data-pad onClick={() => showPage("settings")}>Settings</button>
        <button data-pad onClick={() => goHome()}>Leave race</button></div></section>}
    {overlay && page === "home" && mode === "results" && result && <RaceResults race={result} ownKarts={ownKarts} message={resultMessage}
      series={series} nextRound={() => void nextRound()}
      rematch={() => online.network.current ? void online.operation(() => online.network.current!.connection.returnToLobby()) : void startRace()}
      rematchLabel={online.room ? "Set up a rematch" : undefined} rematchDisabled={!!online.room && online.room.hostId !== online.network.current?.participantId}
      changeRace={() => online.room ? setPage("online") : goHome("setup")} changeLabel={online.room ? "Room" : undefined} home={() => goHome()} />}
  </main>;
}

const container = document.getElementById("root");
if (!container) throw new Error("The game page has no root element.");
createRoot(container).render(<App />);
