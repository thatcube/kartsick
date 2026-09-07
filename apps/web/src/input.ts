import { clamp } from "@kartsick/content";
import { NEUTRAL } from "@kartsick/simulation";
import type { DriverInput } from "@kartsick/simulation";
import type { ButtonAction, KeyAction, Settings } from "./storage";

export type MenuAction = "up" | "down" | "left" | "right" | "accept" | "back" | "pause";
export interface InputCallbacks {
  menu: (action: MenuAction) => void;
  device: (label: string) => void;
  lost: (reason: string) => void;
  rebound: () => void;
}

const keyActions: KeyAction[] = ["throttle", "brake", "left", "right", "drift", "swap", "recover"];
const buttonActions: ButtonAction[] = ["throttle", "brake", "drift", "swap", "recover"];

export function calibrateAxis(value: number, deadzone: number, sensitivity = 1): number {
  if (!Number.isFinite(value) || Math.abs(value) <= deadzone) return 0;
  return clamp(Math.sign(value) * (Math.abs(value) - deadzone) / (1 - deadzone) * sensitivity, -1, 1);
}

export function gamepadHasInput(pad: Pick<Gamepad, "buttons" | "axes">, deadzone: number): boolean {
  return pad.buttons.some(button => button.pressed || button.value > 0.08) ||
    pad.axes.some(axis => Math.abs(axis) > deadzone);
}

export class InputHub {
  private keys = new Set<string>();
  private previousButtons = new Set<number>();
  private gamepadIndex: number | null = null;
  private label = "Keyboard ready";
  private menuRepeat = 0;
  private remap: { kind: "key"; action: KeyAction } | { kind: "button"; action: ButtonAction } | null = null;
  active = true;
  driving = false;
  settings: Settings;
  latest: DriverInput = { ...NEUTRAL };
  private readonly controller = new AbortController();

  constructor(settings: Settings, private readonly callbacks: InputCallbacks) {
    this.settings = settings;
    const signal = this.controller.signal;
    window.addEventListener("keydown", event => {
      if (event.code === "Escape") {
        event.preventDefault();
        if (this.remap) {
          this.remap = null;
          callbacks.rebound();
        } else if (!event.repeat) callbacks.menu(this.driving ? "pause" : "back");
        return;
      }
      if (this.remap?.kind === "key") {
        event.preventDefault();
        if (/^(Key[A-Z]|Digit[0-9]|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight|Arrow(Up|Down|Left|Right))$/.test(event.code)) {
          const occupied = keyActions.find(action => action !== this.remap?.action && this.settings.keys[action] === event.code);
          if (occupied) this.settings.keys[occupied] = this.settings.keys[this.remap.action];
          this.settings.keys[this.remap.action] = event.code;
          this.remap = null;
          this.clear();
          callbacks.rebound();
        }
        return;
      }
      if (this.driving && (Object.values(this.settings.keys).includes(event.code) || event.code.startsWith("Arrow"))) {
        event.preventDefault();
        this.keys.add(event.code);
        this.setLabel("Keyboard");
      }
    }, { signal });
    window.addEventListener("keyup", event => this.keys.delete(event.code), { signal });
    window.addEventListener("blur", () => {
      this.clear();
      this.active = false;
      callbacks.lost("Paused because the game lost focus.");
    }, { signal });
    window.addEventListener("focus", () => { this.active = true; }, { signal });
    document.addEventListener("visibilitychange", () => {
      this.active = !document.hidden;
      if (!this.active) {
        this.clear();
        callbacks.lost("Paused while this tab is in the background.");
      }
    }, { signal });
    window.addEventListener("gamepaddisconnected", event => {
      if (event.gamepad.index === this.gamepadIndex) {
        this.gamepadIndex = null;
        this.clear();
        this.setLabel("Controller disconnected - keyboard available");
        callbacks.lost("Controller disconnected. Reconnect it or use the keyboard, then resume.");
      }
    }, { signal });
  }

  startRemap(kind: "key", action: KeyAction): void;
  startRemap(kind: "button", action: ButtonAction): void;
  startRemap(kind: "key" | "button", action: KeyAction): void {
    if (kind === "key") this.remap = { kind, action };
    else if (action !== "left" && action !== "right") this.remap = { kind, action };
    this.clear();
  }

  clear(): void {
    this.keys.clear();
    this.latest = { ...NEUTRAL };
  }

  private setLabel(label: string): void {
    if (this.label === label) return;
    this.label = label;
    this.callbacks.device(label);
  }

  poll(dt: number): DriverInput {
    const all = navigator.getGamepads?.() ?? [];
    const connected = Array.from(all).filter((pad): pad is Gamepad => pad !== null && pad.connected);
    if (this.gamepadIndex !== null && !connected.some(pad => pad.index === this.gamepadIndex)) {
      this.gamepadIndex = null;
      this.clear();
      this.callbacks.lost("Controller disconnected. Reconnect it or resume with the keyboard.");
    }
    const gamepad = connected.find(pad => pad.index === this.gamepadIndex) ??
      connected.find(pad => gamepadHasInput(pad, this.settings.deadzone));
    if (!this.active) {
      this.latest = { ...NEUTRAL };
      return this.latest;
    }
    const pressed = new Set<number>();
    if (gamepad) {
      this.gamepadIndex = gamepad.index;
      gamepad.buttons.forEach((button, index) => { if (button.pressed || button.value > 0.65) pressed.add(index); });
      const hasActivity = gamepadHasInput(gamepad, this.settings.deadzone);
      if (hasActivity) this.setLabel(gamepad.mapping === "standard" ? "Controller - standard mapping" : "Controller - custom mapping");
      const fresh = [...pressed].filter(index => !this.previousButtons.has(index));
      if (this.remap?.kind === "button" && fresh.length) {
        const occupied = buttonActions.find(action => action !== this.remap?.action && this.settings.buttons[action] === fresh[0]);
        if (occupied) this.settings.buttons[occupied] = this.settings.buttons[this.remap.action];
        this.settings.buttons[this.remap.action] = fresh[0];
        this.remap = null;
        this.callbacks.rebound();
      } else if (fresh.includes(9)) {
        this.callbacks.menu(this.driving ? "pause" : "accept");
      } else if (!this.driving && !this.remap) {
        if (fresh.includes(0)) this.callbacks.menu("accept");
        if (fresh.includes(1)) this.callbacks.menu("back");
        this.menuRepeat -= dt;
        if (this.menuRepeat <= 0) {
          const x = gamepad.axes[0] ?? 0;
          const y = gamepad.axes[1] ?? 0;
          const action = pressed.has(12) || y < -0.6 ? "up" : pressed.has(13) || y > 0.6 ? "down" :
            pressed.has(14) || x < -0.6 ? "left" : pressed.has(15) || x > 0.6 ? "right" : null;
          if (action) {
            this.callbacks.menu(action);
            this.menuRepeat = 0.22;
          }
        }
      }
    }
    this.previousButtons = pressed;
    if (!this.driving || this.remap) return this.latest = { ...NEUTRAL };

    const key = (action: KeyAction, alias?: string) => this.keys.has(this.settings.keys[action]) ||
      Boolean(alias && !Object.values(this.settings.keys).includes(alias) && this.keys.has(alias));
    const button = (action: ButtonAction) => gamepad?.buttons[this.settings.buttons[action]]?.value ?? 0;
    const gasKey = key("throttle", "ArrowUp");
    const brakeKey = key("brake", "ArrowDown");
    const keyboardSteer = Number(key("right", "ArrowRight")) - Number(key("left", "ArrowLeft"));
    const stickSteer = calibrateAxis(gamepad?.axes[0] ?? 0, this.settings.deadzone, this.settings.sensitivity);
    const pitch = calibrateAxis(gamepad?.axes[1] ?? 0, this.settings.deadzone) || Number(brakeKey) - Number(gasKey);
    this.latest = {
      throttle: Math.max(Number(gasKey), button("throttle"), this.settings.buttons.throttle === 7 && pressed.has(0) ? 1 : 0),
      brake: Math.max(Number(brakeKey), button("brake"), this.settings.buttons.brake === 6 && pressed.has(1) ? 1 : 0),
      steer: keyboardSteer || stickSteer,
      pitch: pitch * (this.settings.invertPitch ? -1 : 1),
      drift: key("drift") || button("drift") > 0.5,
      swap: key("swap") || button("swap") > 0.5,
      recover: key("recover") || button("recover") > 0.5,
    };
    return this.latest;
  }

  dispose(): void {
    this.controller.abort();
    this.clear();
  }
}
