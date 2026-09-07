import { CHARACTERS, COURSES, ITEMS, getCourse } from "@kartsick/content";
import type { KartBuild } from "@kartsick/content";
import { NEUTRAL_PLAYER, RACE_LIMITS, copyRace, createKart, standings } from "@kartsick/simulation";
import type { RaceEntry, RaceEvent, RaceOptions, RaceState } from "@kartsick/simulation";
import type { Checkpoint, Room } from "@kartsick/protocol";
import type { GameSettings } from "./game-controls";
import { Soundtrack } from "./audio";
import { GhostRecorder, ghostPose } from "./ghosts";
import type { GhostRun } from "./ghosts";
import { LocalInputHub } from "./local-input";
import type { LocalInputCallbacks, LocalPlayer } from "./local-input";
import { LocalRaceSession, localViews } from "./local-race";
import type { SessionFrame } from "./local-race";
import { OnlineRaceSession, roomRace } from "./online-race";
import type { KartsickNetwork } from "./network";
import { RaceScene } from "./render/race-scene";
import type { RacerFrame } from "./render/race-scene";
import type { HeldItemView, HudFrame, HudView } from "./ui/game-hud";

export type RaceMode = "loading" | "menu" | "race" | "paused" | "results";
export interface RaceRuntimeCallbacks extends Omit<LocalInputCallbacks, "visibility" | "rebound"> {
  mode: (mode: RaceMode, reason?: string) => void;
  views: (views: HudView[]) => void;
  frame: (frame: HudFrame, race: RaceState) => void;
  finished: (race: RaceState, recorder: GhostRecorder | null) => void;
  rebound: (settings: GameSettings) => void;
  audioActivation: (needed: boolean) => void;
  failure: (message: string) => void;
}
const characterName = (id: string) => CHARACTERS.find(character => character.id === id)?.name ?? id;
const itemView = (held: RaceState["karts"][number]["held"][number]): HeldItemView | null => {
  if (!held) return null;
  const item = ITEMS.find(item => item.id === held.item);
  if (!item) throw new Error("The held item has no content definition.");
  return { id: held.item, name: item.name, color: item.color, count: held.charges };
};
const PREVIEW_OPTIONS: RaceOptions = { courseId: "butterbell", mode: "race", speedClass: 100, mirror: false, bots: false, difficulty: "normal", seed: 1 };

export class RaceRuntime {
  readonly view: RaceScene;
  readonly input: LocalInputHub;
  readonly sound: Soundtrack;
  private session: LocalRaceSession | OnlineRaceSession;
  private onlineLobby = false;
  private views: HudView[] = [];
  private rosterSignature = "";
  private recorder: GhostRecorder | null = null;
  private ghost: GhostRun | null = null;
  private ghostState = createKart();
  private readonly resize: ResizeObserver;
  private disposed = false;
  private generation = 0;
  private frameCount = 0;
  private lastFrame = performance.now();
  private frameTimes: number[] = [];
  private p95 = 0;
  private audioTimer: ReturnType<typeof setTimeout> | null = null;
  mode: RaceMode = "loading";
  settings: GameSettings;

  constructor(canvas: HTMLCanvasElement, settings: GameSettings, initial: RaceEntry, private readonly callbacks: RaceRuntimeCallbacks) {
    this.settings = settings;
    this.view = new RaceScene(canvas, settings);
    this.sound = new Soundtrack(settings);
    this.session = new LocalRaceSession(PREVIEW_OPTIONS, [initial]);
    this.input = new LocalInputHub(settings, {
      ...callbacks,
      disconnect: id => { callbacks.disconnect(id); this.pause("A controller disconnected. Reconnect it or choose a keyboard before resuming."); },
      visibility: visible => { if (!visible) this.pause("The game paused while this window was inactive."); },
    });
    this.resize = new ResizeObserver(() => this.view.engine.resize());
    this.resize.observe(canvas);
    this.configureViews(new Set(initial.players.filter((id): id is string => id !== null)));
  }

  get state(): RaceState { return this.session.race; }
  get online(): OnlineRaceSession | null { return this.session instanceof OnlineRaceSession ? this.session : null; }
  get localPlayerIds(): ReadonlySet<string> { return this.online?.localIds ?? new Set(this.input.players.map(player => player.id)); }
  setOnlineLobby(active: boolean): void {
    this.onlineLobby = active;
    this.input.allowJoining = this.mode === "menu" && !active;
  }

  async ready(): Promise<void> {
    await this.view.scene.whenReadyAsync();
    if (this.disposed) return;
    this.setMode("menu");
    this.lastFrame = performance.now();
    this.view.engine.runRenderLoop(() => {
      try { this.frame(); }
      catch (error) {
        console.error("Kartsick stopped after a race runtime error.", error);
        this.callbacks.failure(error instanceof Error ? error.message : String(error));
        this.dispose();
      }
    });
  }

  setPlayers(players: readonly LocalPlayer[]): void { this.input.players = players; }
  applySettings(settings: GameSettings): void {
    const qualityChanged = settings.quality !== this.settings.quality;
    this.settings = settings;
    this.input.settings = settings;
    this.sound.settings = settings;
    if (qualityChanged) this.view.applySettings(settings);
  }
  private setMode(mode: RaceMode, reason?: string): void {
    this.mode = mode;
    this.input.driving = mode === "race";
    this.input.allowJoining = mode === "menu" && !this.onlineLobby;
    this.callbacks.mode(mode, reason);
  }

  preview(build: KartBuild, name: string): void {
    if (this.mode !== "menu") return;
    this.online?.dispose();
    this.view.loadCourse("butterbell");
    const id = this.input.players[0]?.id ?? "local-1";
    this.session = new LocalRaceSession(PREVIEW_OPTIONS, [{ id: "preview", name, build, players: [id, null] }]);
    this.ghost = null;
    this.configureViews(new Set([id]));
  }

  private configureViews(localIds: ReadonlySet<string>): void {
    this.rosterSignature = this.rosterKey();
    this.views = localViews(this.state.karts, localIds);
    this.view.setRoster([
      ...this.state.karts.map(kart => ({ id: kart.id, build: kart.build })),
      ...(this.ghost ? [{ id: "time-trial-ghost", build: this.ghost.build, ghost: true }] : []),
    ]);
    this.view.setViews(this.views);
    this.callbacks.views(this.views);
  }
  private rosterKey(): string {
    return JSON.stringify(this.state.karts.map(kart => [kart.id, kart.name, kart.build, kart.players]));
  }

  cycleSpectator(): void {
    if (!this.online || this.state.karts.some(kart => kart.players.some(id => id !== null && this.localPlayerIds.has(id)))) return;
    const index = this.state.karts.findIndex(kart => kart.id === this.views[0]?.id);
    const kart = this.state.karts[(index + 1) % this.state.karts.length];
    this.views = [{ id: kart.id, label: `Watching ${kart.name}`, viewport: { x: 0, y: 0, width: 1, height: 1 } }];
    this.view.setViews(this.views);
    this.callbacks.views(this.views);
  }

  async start(options: RaceOptions, entries: readonly RaceEntry[], ghost: GhostRun | null = null): Promise<void> {
    const generation = ++this.generation;
    this.input.clear();
    this.setMode("loading");
    this.online?.dispose();
    this.session = new LocalRaceSession(options, entries);
    this.view.loadCourse(options.courseId);
    this.ghost = options.mode === "time-trial" ? ghost : null;
    this.ghostState = createKart(getCourse(options.courseId, options.mirror));
    this.recorder = options.mode === "time-trial" ? new GhostRecorder() : null;
    this.recorder?.sample(this.state.karts[0].state);
    this.configureViews(new Set(this.input.players.map(player => player.id)));
    this.enableSound();
    await this.view.scene.whenReadyAsync();
    if (this.disposed || generation !== this.generation) return;
    this.session.resetClock();
    this.lastFrame = performance.now();
    this.setMode("race");
    this.enableSound();
  }

  async prepareOnline(room: Room, identities: ReadonlyMap<string, string>): Promise<void> {
    const generation = ++this.generation;
    const state = roomRace(room);
    this.input.clear();
    this.setMode("loading");
    this.online?.dispose();
    this.session = new LocalRaceSession(state.options, state.karts);
    this.view.loadCourse(state.options.courseId);
    this.ghost = null;
    this.recorder = null;
    this.configureViews(new Set(identities.values()));
    await this.view.scene.whenReadyAsync();
    if (!this.disposed && generation === this.generation) this.setMode("menu");
  }

  async startOnline(network: KartsickNetwork<RaceState, RaceEvent[]>, identities: ReadonlyMap<string, string>): Promise<void> {
    const generation = ++this.generation;
    this.input.clear();
    this.setMode("loading");
    this.online?.dispose();
    const session = new OnlineRaceSession(network, identities, this.callbacks.warning);
    this.session = session;
    this.view.loadCourse(session.race.options.courseId);
    this.ghost = null;
    this.recorder = null;
    this.configureViews(session.localIds);
    await this.view.scene.whenReadyAsync();
    if (this.disposed || generation !== this.generation) return;
    session.alignCountdown();
    session.resetClock();
    this.lastFrame = performance.now();
    this.setMode("race");
    this.enableSound();
  }

  restoreOnline(checkpoint: Checkpoint<RaceState>): void {
    const session = this.online;
    if (!session) throw new Error("There is no loaded online race to restore.");
    session.restore(checkpoint);
  }

  pause(reason = "Take a breather."): void {
    if (this.mode !== "race") return;
    this.input.clear();
    this.session.resetClock();
    this.setMode("paused", this.online ? `${reason} The online race continues; unattended karts get temporary AI.` : reason);
    if (this.audioTimer !== null) clearTimeout(this.audioTimer);
    this.audioTimer = null;
    this.callbacks.audioActivation(false);
    void this.sound.suspend().catch(error => this.callbacks.warning(`Audio could not pause: ${String(error)}`));
  }

  resume(): void {
    if (this.mode !== "paused") return;
    const localIds = this.localPlayerIds;
    const unattended = this.state.karts.find(kart => kart.players.some(id => id !== null && localIds.has(id)) &&
      !kart.players.some(id => this.input.players.some(player => (this.online?.identities.get(player.id) ?? player.id) === id && player.connected)));
    if (unattended) {
      this.callbacks.warning(`Reconnect a controller or choose the keyboard for ${unattended.name} before resuming.`);
      return;
    }
    this.input.clear();
    this.session.resetClock();
    this.setMode("race");
    this.enableSound();
  }

  menu(build: KartBuild, name: string): void {
    this.generation++;
    this.input.clear();
    this.setMode("menu");
    this.preview(build, name);
    this.enableSound();
  }

  enableSound(): void {
    if (this.audioTimer !== null) clearTimeout(this.audioTimer);
    this.audioTimer = setTimeout(() => {
      this.audioTimer = null;
      if (!this.disposed && this.mode !== "paused") this.callbacks.audioActivation(!this.sound.running);
    }, 250);
    void this.sound.activate().then(() => {
      if (!this.disposed) this.callbacks.audioActivation(false);
    }).catch(error => {
      if (this.audioTimer !== null) clearTimeout(this.audioTimer);
      this.audioTimer = null;
      if (!this.disposed) {
        this.callbacks.audioActivation(false);
        this.callbacks.warning(`Sound could not start: ${error instanceof Error ? error.message : String(error)}. Racing still works.`);
      }
    });
  }

  private roles(): void {
    const roles: Record<string, "solo" | "driver" | "rear"> = Object.create(null);
    for (const kart of this.state.karts) kart.players.forEach((id, seat) => {
      if (!id) return;
      const other = seat === 0 ? 1 : 0;
      const localId = this.online ? [...this.online.identities].find(([, networkId]) => networkId === id)?.[0] : id;
      if (localId) roles[localId] = !kart.players[other] || kart.missing[other] >= RACE_LIMITS.missingInputTicks ? "solo" : seat === kart.state.driver ? "driver" : "rear";
    });
    this.input.roles = roles;
  }

  private visuals(frame: SessionFrame, elapsed: number): RacerFrame[] {
    const values: RacerFrame[] = frame.race.karts.map(kart => ({
      id: kart.id, state: frame.remote?.get(kart.id)?.state ?? kart.state,
      previous: frame.remote?.get(kart.id)?.previous ?? frame.previous.get(kart.id) ?? kart.state,
      alpha: frame.remote?.get(kart.id)?.alpha ?? frame.alpha,
      input: kart.previous[kart.state.driver], effects: {
        invincible: kart.status.invincible > 0, shrunk: kart.status.shrink > 0, ghost: kart.status.ghost > 0,
        velvetBumpers: frame.race.items.filter(effect => effect.owner === kart.id && effect.kind === "bumper").reduce((sum, effect) => sum + effect.charges, 0),
        staticCharges: frame.race.items.filter(effect => effect.owner === kart.id && effect.kind === "coil").reduce((sum, effect) => sum + effect.charges, 0),
      },
    }));
    if (this.ghost) {
      const pose = ghostPose(this.ghost, this.state.karts[0].state.elapsed);
      if (pose) {
        const previous = this.ghostState;
        this.ghostState = {
          ...previous, ...pose, tick: this.state.karts[0].state.tick, boost: pose.boost ? 1 : 0,
          speed: Math.hypot(pose.x - previous.x, pose.z - previous.z) / Math.max(1 / 60, elapsed),
          vx: (pose.x - previous.x) / Math.max(1 / 60, elapsed), vz: (pose.z - previous.z) / Math.max(1 / 60, elapsed),
          vy: (pose.y - previous.y) / Math.max(1 / 60, elapsed),
          swapTime: pose.driver !== previous.driver ? 0.5 : Math.max(0, previous.swapTime - elapsed),
        };
      }
      values.push({ id: "time-trial-ghost", state: this.ghostState, previous: this.ghostState, input: NEUTRAL_PLAYER, alpha: 1, effects: { ghost: true }, visible: pose !== null });
    }
    return values;
  }

  private hud(): HudFrame {
    const race = this.state;
    const places = standings(race);
    const course = getCourse(race.options.courseId, race.options.mirror);
    return {
      views: this.views.map(view => {
        const kart = race.karts.find(kart => kart.id === view.id)!;
        const state = kart.state;
        const driver = state.driver;
        const rear = driver === 0 ? 1 : 0;
        return {
          id: kart.id, position: places.find(place => place.id === kart.id)?.position ?? 1, fieldSize: race.karts.length,
          lap: state.lap, laps: course.format === "sectors" ? 3 : course.laps, time: state.elapsed, lapTime: state.elapsed - state.lapStart,
          speed: state.speed, driftCharge: state.driftCharge, driver: characterName(kart.build.characters[driver]), rear: characterName(kart.build.characters[rear]),
          frontItem: itemView(kart.held[driver]), rearItem: itemView(kart.held[rear]), vision: kart.status.vision > 0, invincible: kart.status.invincible > 0,
          courseName: COURSES.find(course => course.id === race.options.courseId)!.name, sector: course.format === "sectors", finished: state.finished,
          ghostTime: this.ghost?.time ?? null,
          tell: state.finished ? "FINISHED" : kart.ai ? "TEMPORARY AI TAKEOVER" : state.recovery > 0 ? "BACK ON TRACK" :
            kart.status.autopilot > 0 ? "COMEBACK AUTOPILOT" : kart.status.stun > 0 ? "HIT!" : state.wrongWay ? "WRONG WAY" :
              kart.status.shrink > 0 ? "SHRUNK" : state.mode === "glider" ? "GLIDING" : state.mode === "air" ? "AIRBORNE" :
                state.boost > 0 ? "BOOST!" : state.driftCharge === 3 ? "RELEASE DRIFT" : state.driftDirection ? "COUNTERSTEER OUT, THEN IN" : state.offRoad ? "OFF ROAD" : "",
        };
      }),
      countdown: race.phase === "countdown" ? Math.max(0, (RACE_LIMITS.countdownTicks - race.tick) / 60) : null,
      finishCountdown: race.phase === "finishing" && race.firstFinishTick !== null ? Math.max(0, (RACE_LIMITS.finishTicks - race.tick + race.firstFinishTick) / 60) : null,
      fps: this.view.engine.getFps(), p95: this.p95, connection: this.online?.connectionLabel ?? "LOCAL RACE",
    };
  }

  private frame(): void {
    const now = performance.now();
    const elapsed = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    this.frameTimes.push(elapsed * 1000);
    if (this.frameTimes.length > 240) this.frameTimes.shift();
    if (++this.frameCount % 20 === 0) {
      const sorted = this.frameTimes.slice().sort((a, b) => a - b);
      this.p95 = sorted[Math.floor((sorted.length - 1) * 0.95)] ?? 0;
    }
    this.roles();
    const input = this.input.poll(Math.min(elapsed, 0.05));
    const frame = this.mode === "race" || (this.mode === "paused" || this.mode === "results") && this.online ? this.session.advance(elapsed, this.mode === "race" ? input : {}, race => {
      if (race.phase !== "countdown") this.recorder?.sample(race.karts[0].state);
    }) : this.session.paused();
    if (this.online && this.rosterSignature !== this.rosterKey()) this.configureViews(this.localPlayerIds);
    const audible = new Set(this.views.map(view => view.id));
    for (const event of frame.events) {
      if (audible.has(event.kartId) || event.type === "start") this.sound.raceEvent(event);
      if (event.type === "hit" || event.type === "collision" || event.type === "land") this.view.bump(event.kartId);
    }
    if (this.session.finished && (this.mode === "race" || this.mode === "paused" && this.online)) {
      this.input.clear();
      this.setMode("results");
      this.callbacks.finished(copyRace(this.state), this.recorder);
    }
    const primary = this.state.karts.find(kart => kart.id === this.views[0]?.id);
    if (primary) this.sound.update(primary.state, this.mode === "race", primary.previous[primary.state.driver].throttle);
    this.view.render(this.visuals(frame, elapsed), getCourse(this.state.options.courseId, this.state.options.mirror), this.mode === "menu" ? [] : this.state.pickups,
      this.mode === "menu" ? [] : this.state.items, elapsed, this.mode === "menu", this.mode === "race" || this.mode === "paused" && this.online !== null, this.state.tick / 60);
    this.callbacks.frame(this.hud(), this.state);
  }

  snapshot() {
    return {
      race: copyRace(this.state), mode: this.mode, fps: this.view.engine.getFps(), p95: this.p95,
      dropped: this.session.droppedSeconds, views: structuredClone(this.views),
      renderWidth: this.view.engine.getRenderWidth(), renderHeight: this.view.engine.getRenderHeight(),
      activeMeshes: this.view.scene.getActiveMeshes().length, totalVertices: this.view.scene.getTotalVertices(),
      online: this.online?.metrics() ?? null,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    if (this.audioTimer !== null) clearTimeout(this.audioTimer);
    this.view.engine.stopRenderLoop();
    this.resize.disconnect();
    this.input.dispose();
    this.online?.dispose();
    void this.sound.dispose().catch(error => console.error("Audio shutdown failed.", error));
    this.view.dispose();
  }
}
