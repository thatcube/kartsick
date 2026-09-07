import { gamepadHasInput } from "./input";
import type { MenuAction } from "./input";
import {
  GAME_KEY_ACTIONS, IDLE_CONTROL, controllerFamily, padIsFinite, readKeyboard, readPad,
  rebindButton, rebindKey,
} from "./game-controls";
import type { Calibration, ControllerFamily, GameButtonAction, GameKeyAction, GameSettings, LocalControl, PlayerRole } from "./game-controls";

export type LocalDevice = { kind: "unassigned" } | { kind: "keyboard" } | { kind: "gamepad"; index: number; id: string; family: ControllerFamily };
export interface LocalPlayer {
  id: string;
  name: string;
  device: LocalDevice;
  connected: boolean;
  calibration: Calibration | null;
}
export interface LocalInputCallbacks {
  menu: (action: MenuAction, playerId: string) => void;
  device: (playerId: string, device: LocalDevice) => void;
  join: (device: LocalDevice) => void;
  disconnect: (playerId: string) => void;
  warning: (message: string) => void;
  rebound: (settings: GameSettings) => void;
  remapNotice: (message: string | null) => void;
  visibility: (visible: boolean) => void;
}

export class LocalInputHub {
  private readonly abort = new AbortController();
  private readonly keys = new Set<string>();
  private readonly keyLatch = new Set<string>();
  private readonly previous = new Map<number, Set<number>>();
  private readonly repeat = new Map<number, number>();
  private readonly latch = new Set<number>();
  private readonly disconnected = new Set<string>();
  private readonly invalidPads = new Set<number>();
  private remap: { kind: "key"; action: GameKeyAction } | { kind: "button"; action: GameButtonAction } | null = null;
  private capture: string | null = null;
  private accessWarning = false;
  private keyRepeat = 0;
  private readonly axes = new Map<string, { rawX: number; rawY: number; x: number; y: number }>();
  players: readonly LocalPlayer[] = [];
  roles: Readonly<Record<string, PlayerRole>> = {};
  driving = false;
  allowJoining = false;
  active = true;
  settings: GameSettings;
  get axisSamples(): ReadonlyMap<string, { rawX: number; rawY: number; x: number; y: number }> { return this.axes; }

  constructor(settings: GameSettings, private readonly callbacks: LocalInputCallbacks) {
    this.settings = settings;
    const signal = this.abort.signal;
    window.addEventListener("keydown", event => this.keyDown(event), { signal });
    window.addEventListener("keyup", event => { this.keys.delete(event.code); this.keyLatch.delete(event.code); }, { signal });
    window.addEventListener("blur", () => this.visibility(false), { signal });
    window.addEventListener("focus", () => this.visibility(!document.hidden), { signal });
    document.addEventListener("visibilitychange", () => this.visibility(!document.hidden), { signal });
    window.addEventListener("gamepaddisconnected", event => {
      for (const player of this.players) {
        if (player.device.kind === "gamepad" && player.device.index === event.gamepad.index) this.lost(player.id);
      }
    }, { signal });
  }

  private visibility(visible: boolean): void {
    this.active = visible;
    if (!visible) this.clear();
    this.callbacks.visibility(visible);
  }

  clear(): void {
    for (const code of this.keys) this.keyLatch.add(code);
    this.keys.clear();
    for (const player of this.players) if (player.device.kind === "gamepad") this.latch.add(player.device.index);
  }

  captureDevice(playerId: string): void {
    if (!this.players.some(player => player.id === playerId)) throw new RangeError("That local player does not exist.");
    this.capture = playerId;
    this.callbacks.remapNotice("Press a button on the controller for this player, or Escape to cancel.");
  }

  bindKeyboard(playerId: string): void {
    if (!this.players.some(player => player.id === playerId)) throw new RangeError("That local player does not exist.");
    if (this.players.some(player => player.id !== playerId && player.device.kind === "keyboard")) {
      this.callbacks.warning("One keyboard player can join alongside controllers.");
      return;
    }
    this.disconnected.delete(playerId);
    this.callbacks.device(playerId, { kind: "keyboard" });
  }

  startRemap(kind: "key", action: GameKeyAction): void;
  startRemap(kind: "button", action: GameButtonAction): void;
  startRemap(kind: "key" | "button", action: GameKeyAction): void {
    if (kind === "key") this.remap = { kind, action };
    else if (action !== "left" && action !== "right" && action !== "throwBack") this.remap = { kind, action };
    else throw new TypeError("This action uses the controller stick.");
    this.clear();
    this.callbacks.remapNotice(`Press a new ${kind === "key" ? "key" : "controller button"}. Escape cancels.`);
  }

  cancelRemap(): void {
    this.remap = null;
    this.capture = null;
    this.callbacks.remapNotice(null);
  }

  private keyDown(event: KeyboardEvent): void {
    if (event.code === "Escape") {
      event.preventDefault();
      if (this.remap || this.capture) this.cancelRemap();
      else if (!event.repeat) this.callbacks.menu(this.driving ? "pause" : "back", this.players[0]?.id ?? "local-1");
      return;
    }
    if (this.remap?.kind === "key") {
      event.preventDefault();
      try {
        this.settings = rebindKey(this.settings, this.remap.action, event.code);
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        this.callbacks.remapNotice(error.message);
        return;
      }
      this.cancelRemap();
      this.clear();
      this.callbacks.rebound(this.settings);
      return;
    }
    if (!this.driving) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      const action = event.code === "ArrowUp" ? "up" : event.code === "ArrowDown" ? "down" :
        event.code === "ArrowLeft" ? "left" : event.code === "ArrowRight" ? "right" : null;
      if (action && performance.now() - this.keyRepeat > 100) {
        event.preventDefault();
        this.keyRepeat = performance.now();
        this.callbacks.menu(action, this.players[0]?.id ?? "local-1");
      }
      return;
    }
    if (GAME_KEY_ACTIONS.some(action => this.settings.keys[action] === event.code) || event.code.startsWith("Arrow")) {
      event.preventDefault();
      if (this.keyLatch.has(event.code)) {
        if (event.repeat) return;
        this.keyLatch.delete(event.code);
      }
      this.keys.add(event.code);
    }
  }

  private lost(playerId: string): void {
    if (this.disconnected.has(playerId)) return;
    this.disconnected.add(playerId);
    this.callbacks.disconnect(playerId);
  }

  private pads(): Gamepad[] {
    try {
      return Array.from(navigator.getGamepads?.() ?? []).filter((pad): pad is Gamepad => pad !== null && pad.connected);
    } catch (error) {
      if (!(error instanceof DOMException) || !["SecurityError", "NotAllowedError"].includes(error.name)) throw error;
      if (!this.accessWarning) this.callbacks.warning("This browser view blocks controller access. Open the game in a desktop browser, or use the keyboard.");
      this.accessWarning = true;
      return [];
    }
  }

  poll(dt: number): Record<string, LocalControl> {
    const inputs: Record<string, LocalControl> = Object.create(null);
    this.axes.clear();
    const pads = this.pads();
    for (const player of this.players) {
      const device = player.device;
      if (device.kind === "gamepad" && !pads.some(pad => pad.index === device.index && pad.id === device.id)) this.lost(player.id);
    }
    if (!this.active) return inputs;
    for (const pad of pads) {
      const pressed = new Set(pad.buttons.flatMap((button, index) => button.pressed || button.value > 0.65 ? [index] : []));
      const fresh = [...pressed].filter(index => !this.previous.get(pad.index)?.has(index));
      this.previous.set(pad.index, pressed);
      const device: LocalDevice = { kind: "gamepad", index: pad.index, id: pad.id, family: controllerFamily(pad.id) };
      const accept = device.family === "switch" ? 1 : 0;
      const back = device.family === "switch" ? 0 : 1;
      let player = this.players.find(candidate => candidate.device.kind === "gamepad" && candidate.device.index === pad.index && candidate.device.id === pad.id);
      if (this.capture && fresh.length) {
        if (player && player.id !== this.capture) {
          this.callbacks.remapNotice("That controller already belongs to another local player.");
        } else {
          this.callbacks.device(this.capture, device);
          this.disconnected.delete(this.capture);
          this.latch.add(pad.index);
          this.cancelRemap();
        }
        continue;
      }
      if (!player && gamepadHasInput(pad, this.settings.deadzone)) {
        const empty = this.players.find(candidate => candidate.device.kind === "unassigned");
        if (empty) {
          this.callbacks.device(empty.id, device);
          player = { ...empty, device, connected: true };
        } else if (this.allowJoining && (fresh.includes(accept) || fresh.includes(9))) {
          if (this.players.length < 4) this.callbacks.join(device);
          else this.callbacks.warning("Four local players are already connected.");
          this.latch.add(pad.index);
          continue;
        }
      }
      if (!player) continue;
      if (this.disconnected.has(player.id)) {
        if (!fresh.includes(accept) && !fresh.includes(9)) continue;
        this.disconnected.delete(player.id);
        this.callbacks.device(player.id, device);
        this.latch.add(pad.index);
        continue;
      }
      if (this.driving) inputs[player.id] = { ...IDLE_CONTROL };
      if (!padIsFinite(pad)) {
        if (!this.invalidPads.has(pad.index)) this.callbacks.warning("A controller reported invalid input. Its input is ignored until it reports valid values again.");
        this.invalidPads.add(pad.index);
        continue;
      }
      this.invalidPads.delete(pad.index);
      const decoded = readPad(pad, this.settings, player.calibration ?? this.settings, this.roles[player.id] ?? "solo", device.family);
      this.axes.set(player.id, { rawX: pad.axes[0] ?? 0, rawY: pad.axes[1] ?? 0, x: decoded.steer, y: decoded.pitch });
      if (this.remap?.kind === "button" && fresh.length) {
        try {
          this.settings = rebindButton(this.settings, this.remap.action, fresh[0]);
        } catch (error) {
          if (!(error instanceof TypeError)) throw error;
          this.callbacks.remapNotice(error.message);
          continue;
        }
        this.cancelRemap();
        this.clear();
        this.callbacks.rebound(this.settings);
        continue;
      }
      if (this.latch.has(pad.index)) {
        if (gamepadHasInput(pad, (player.calibration ?? this.settings).deadzone)) continue;
        this.latch.delete(pad.index);
      }
      if (fresh.includes(9)) this.callbacks.menu(this.driving ? "pause" : "accept", player.id);
      else if (!this.driving && !this.remap) {
        if (fresh.includes(accept)) this.callbacks.menu("accept", player.id);
        if (fresh.includes(back)) this.callbacks.menu("back", player.id);
        const wait = (this.repeat.get(pad.index) ?? 0) - dt;
        this.repeat.set(pad.index, wait);
        if (wait <= 0) {
          const x = pad.axes[0] ?? 0;
          const y = pad.axes[1] ?? 0;
          const action = pressed.has(12) || y < -0.6 ? "up" : pressed.has(13) || y > 0.6 ? "down" :
            pressed.has(14) || x < -0.6 ? "left" : pressed.has(15) || x > 0.6 ? "right" : null;
          if (action) {
            this.callbacks.menu(action, player.id);
            this.repeat.set(pad.index, 0.22);
          }
        }
      }
      if (this.active && this.driving && !this.remap && !this.latch.has(pad.index)) {
        inputs[player.id] = decoded;
      }
    }
    if (!this.active || !this.driving || this.remap) return {};
    const keyboard = this.players.find(player => player.device.kind === "keyboard") ??
      (this.players.length === 1 ? this.players[0] : this.players.find(player => player.device.kind === "unassigned"));
    if (keyboard && (keyboard.device.kind === "keyboard" || keyboard.device.kind === "unassigned" || this.keys.size > 0)) {
      const keyInput = readKeyboard(this.keys, this.settings, this.roles[keyboard.id] ?? "solo", keyboard.calibration ?? this.settings);
      if (this.keys.size && keyboard.device.kind === "unassigned") this.callbacks.device(keyboard.id, { kind: "keyboard" });
      if (!inputs[keyboard.id] || this.keys.size > 0) inputs[keyboard.id] = keyInput;
    }
    for (const player of this.players) {
      if (!this.disconnected.has(player.id) && player.device.kind !== "gamepad" && !inputs[player.id]) inputs[player.id] = { ...IDLE_CONTROL };
    }
    return inputs;
  }

  dispose(): void {
    this.abort.abort();
    this.clear();
    this.previous.clear();
  }
}
