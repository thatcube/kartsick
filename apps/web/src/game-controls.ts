import { clamp } from "@kartsick/content";
import { NEUTRAL } from "@kartsick/simulation";
import type { DriverInput } from "@kartsick/simulation";
import { calibrateAxis } from "./input";
import { DEFAULT_SETTINGS } from "./storage";
import type { ButtonAction, KeyAction, Settings } from "./storage";

export type GameButtonAction = ButtonAction | "useItem" | "passItem" | "slideLeft" | "slideRight";
export type GameKeyAction = KeyAction | "useItem" | "passItem" | "slideLeft" | "slideRight" | "throwBack";
export type ControllerFamily = "xbox" | "playstation" | "switch" | "generic";
export type PlayerRole = "solo" | "driver" | "rear";
export interface Calibration {
  deadzone: number;
  sensitivity: number;
  invertPitch: boolean;
}
export interface GameSettings extends Settings {
  keys: Record<GameKeyAction, string>;
  buttons: Record<GameButtonAction, number>;
  faceDrive: boolean;
}
export interface LocalControl extends DriverInput {
  useItem: boolean;
  throwDirection: -1 | 1;
  slide: -1 | 0 | 1;
  passItem: boolean;
}
export const IDLE_CONTROL: Readonly<LocalControl> = Object.freeze({
  ...NEUTRAL, useItem: false, throwDirection: 1, slide: 0, passItem: false,
});
export const GAME_BUTTON_ACTIONS: readonly GameButtonAction[] = [
  "throttle", "brake", "drift", "useItem", "swap", "passItem", "slideLeft", "slideRight", "recover",
];
export const GAME_KEY_ACTIONS: readonly GameKeyAction[] = [
  "throttle", "brake", "left", "right", "drift", "useItem", "swap", "passItem", "slideLeft", "slideRight", "throwBack", "recover",
];
export const ACTION_LABELS: Record<GameKeyAction, string> = {
  throttle: "Accelerate", brake: "Brake / reverse", left: "Steer left", right: "Steer right",
  drift: "Drift", useItem: "Use item", swap: "Swap riders", passItem: "Pass item",
  slideLeft: "Rear attack left", slideRight: "Rear attack right", throwBack: "Throw backward", recover: "Recover kart",
};
export const DEFAULT_GAME_SETTINGS: GameSettings = {
  ...structuredClone(DEFAULT_SETTINGS),
  faceDrive: true,
  buttons: { ...DEFAULT_SETTINGS.buttons, recover: 11, useItem: 4, passItem: 8, slideLeft: 2, slideRight: 1 },
  keys: {
    ...DEFAULT_SETTINGS.keys, useItem: "KeyE", passItem: "KeyQ",
    slideLeft: "KeyZ", slideRight: "KeyX", throwBack: "ShiftLeft",
  },
};

export function controllerFamily(id: string): ControllerFamily {
  if (/playstation|dualsense|dualshock|054c|sony/i.test(id)) return "playstation";
  if (/switch|nintendo|057e/i.test(id)) return "switch";
  if (/xbox|xinput|045e/i.test(id)) return "xbox";
  return "generic";
}

const BUTTON_NAMES: Record<ControllerFamily, readonly string[]> = {
  xbox: ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "Left stick", "Right stick"],
  playstation: ["Cross", "Circle", "Square", "Triangle", "L1", "R1", "L2", "R2", "Share", "Options", "L3", "R3"],
  switch: ["B", "A", "Y", "X", "L", "R", "ZL", "ZR", "Minus", "Plus", "Left stick", "Right stick"],
  generic: ["South face", "East face", "West face", "North face", "Left shoulder", "Right shoulder", "Left trigger", "Right trigger", "Select", "Start", "Left stick", "Right stick"],
};
export function buttonName(button: number, family: ControllerFamily = "generic"): string {
  return BUTTON_NAMES[family][button] ?? ["D-pad up", "D-pad down", "D-pad left", "D-pad right", "Home"][button - 12] ?? `Button ${button}`;
}
export function keyName(code: string): string {
  return code.replace(/^Key|^Digit/, "").replace("Arrow", "").replace("ShiftLeft", "Left Shift").replace("ShiftRight", "Right Shift");
}
export function validKey(code: string): boolean {
  return /^(Key[A-Z]|Digit[0-9]|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight|Arrow(Up|Down|Left|Right))$/.test(code);
}
export function validButton(button: number): boolean {
  return Number.isInteger(button) && button >= 0 && button <= 31 && button !== 9 && button !== 16;
}

export function rebindKey(settings: GameSettings, action: GameKeyAction, code: string): GameSettings {
  if (!validKey(code)) throw new TypeError("Choose a letter, number, arrow, Space, Shift, or Control. Escape is reserved.");
  const keys = { ...settings.keys };
  const occupied = GAME_KEY_ACTIONS.find(other => other !== action && keys[other] === code);
  if (occupied) keys[occupied] = keys[action];
  keys[action] = code;
  return { ...settings, keys };
}
export function rebindButton(settings: GameSettings, action: GameButtonAction, button: number): GameSettings {
  if (!validButton(button)) throw new TypeError("Menu / Start and Home are reserved. Choose another button.");
  const buttons = { ...settings.buttons };
  const occupied = GAME_BUTTON_ACTIONS.find(other => other !== action && buttons[other] === button);
  if (occupied) buttons[occupied] = buttons[action];
  buttons[action] = button;
  return { ...settings, buttons };
}

export function padIsFinite(pad: Pick<Gamepad, "buttons" | "axes">): boolean {
  return pad.axes.every(value => Number.isFinite(value) && value >= -1 && value <= 1) &&
    pad.buttons.every(button => Number.isFinite(button.value) && button.value >= 0 && button.value <= 1);
}

export function readPad(pad: Pick<Gamepad, "buttons" | "axes">, settings: GameSettings, calibration: Calibration, role: PlayerRole, family: ControllerFamily = "generic"): LocalControl {
  const button = (index: number) => {
    const value = pad.buttons[index]?.value ?? 0;
    return Number.isFinite(value) ? clamp(value, 0, 1) : 0;
  };
  const action = (name: GameButtonAction) => button(settings.buttons[name]);
  const face = (index: number) => GAME_BUTTON_ACTIONS.some(name =>
    name !== "throttle" && name !== "brake" && (role === "rear" || (name !== "slideLeft" && name !== "slideRight")) &&
    settings.buttons[name] === index) ? 0 : button(index);
  const pitch = calibrateAxis(pad.axes[1] ?? 0, calibration.deadzone);
  return {
    throttle: Math.max(action("throttle"), settings.faceDrive && settings.buttons.throttle === 7 ? face(family === "switch" ? 1 : 0) : 0),
    brake: Math.max(action("brake"), settings.faceDrive && settings.buttons.brake === 6 ? face(family === "switch" ? 0 : 1) : 0),
    steer: calibrateAxis(pad.axes[0] ?? 0, calibration.deadzone, calibration.sensitivity),
    pitch: pitch * (calibration.invertPitch ? -1 : 1),
    drift: action("drift") > 0.5,
    swap: action("swap") > 0.5,
    recover: action("recover") > 0.5,
    useItem: action("useItem") > 0.5,
    throwDirection: pitch > 0.35 ? -1 : 1,
    passItem: action("passItem") > 0.5,
    slide: role === "rear" ? action("slideLeft") > 0.5 ? -1 : action("slideRight") > 0.5 ? 1 : 0 : 0,
  };
}

export function readKeyboard(keys: ReadonlySet<string>, settings: GameSettings, role: PlayerRole, calibration: Calibration = settings): LocalControl {
  const key = (action: GameKeyAction, alias?: string) => keys.has(settings.keys[action]) ||
    Boolean(alias && !Object.values(settings.keys).includes(alias) && keys.has(alias));
  const gas = key("throttle", "ArrowUp");
  const brake = key("brake", "ArrowDown");
  return {
    throttle: Number(gas), brake: Number(brake),
    steer: Number(key("right", "ArrowRight")) - Number(key("left", "ArrowLeft")),
    pitch: (Number(brake) - Number(gas)) * (calibration.invertPitch ? -1 : 1),
    drift: key("drift"), recover: key("recover"), swap: key("swap"),
    useItem: key("useItem"), passItem: key("passItem"),
    throwDirection: key("throwBack") ? -1 : 1,
    slide: role === "rear" ? key("slideLeft") ? -1 : key("slideRight") ? 1 : 0 : 0,
  };
}
