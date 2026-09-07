import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { GAP_END, GAP_START, ROAD, STUDY } from "@kartsick/content";
import type { KartState } from "@kartsick/simulation";
import type { MenuAction } from "./input";
import { GameRuntime } from "./runtime";
import type { FrameSnapshot, Mode } from "./runtime";
import { DEFAULT_SETTINGS, formatTime, freshSave, loadSave, persistSave } from "./storage";
import type { ButtonAction, KeyAction, SaveData, Settings } from "./storage";
import "./style.css";

declare global {
  interface Window {
    __KARTSICK_DIAGNOSTICS__?: { read: () => FrameSnapshot };
  }
}

const keyActions: [KeyAction, string][] = [
  ["throttle", "Accelerate / dive"], ["brake", "Brake / pull up"], ["left", "Steer left"],
  ["right", "Steer right"], ["drift", "Drift"], ["swap", "Swap riders"], ["recover", "Recover kart"],
];
const buttonActions: [ButtonAction, string][] = [
  ["throttle", "Accelerate"], ["brake", "Brake / reverse"], ["drift", "Drift"],
  ["swap", "Swap riders"], ["recover", "Recover kart"],
];
const buttonNames = ["South face", "East face", "West face", "North face", "Left shoulder", "Right shoulder", "Left trigger", "Right trigger"];
const mapX = (x: number) => (x + 55) / 220 * 200;
const mapY = (z: number) => (140 - z) / 300 * 225;
const mapPath = ROAD.filter((_, i) => i % 4 === 0).map(point => `${mapX(point.x)},${mapY(point.z)}`).join(" ");
const gapPath = ROAD.filter(point => point.u >= GAP_START && point.u <= GAP_END).map(point => `${mapX(point.x)},${mapY(point.z)}`).join(" ");

function openStorage(): { data: SaveData; warning: string | null; storage: Storage | null } {
  try {
    const storage = window.localStorage;
    return { ...loadSave(storage), storage };
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
    return { data: freshSave(), warning: "Browser storage is blocked. This visit works, but settings and times cannot be saved.", storage: null };
  }
}

function App(): React.JSX.Element {
  const [loaded] = useState(openStorage);
  const [data, setData] = useState(loaded.data);
  const saveRef = useRef(data);
  const [warning, setWarning] = useState(loaded.warning);
  const [failure, setFailure] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("loading");
  const [panel, setPanel] = useState<"settings" | "controls" | null>(null);
  const [pauseReason, setPauseReason] = useState("Take a breather.");
  const [device, setDevice] = useState("Keyboard ready / press a controller button to connect");
  const [remap, setRemap] = useState<string | null>(null);
  const [result, setResult] = useState<KartState | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const runtime = useRef<GameRuntime | null>(null);
  const ui = useRef({ mode, panel });
  const actions = useRef<(action: MenuAction) => void>(() => {});
  ui.current = { mode, panel };
  saveRef.current = data;

  function save(next: SaveData): void {
    saveRef.current = next;
    setData(next);
    const problem = loaded.storage ? persistSave(loaded.storage, next) : "Browser storage is blocked; this change will last only for this visit.";
    if (problem) setWarning(problem);
  }

  function settings(next: Settings): void {
    runtime.current?.applySettings(next);
    save({ ...saveRef.current, settings: next });
  }

  function onFrame(frame: FrameSnapshot): void {
    const node = hud.current;
    if (!node) return;
    const state = frame.state;
    const values = {
      speed: String(Math.round(Math.abs(state.speed) * 3.6)),
      lap: `${state.lap} / ${STUDY.laps}`,
      timer: formatTime(state.elapsed),
      lapTime: formatTime(state.elapsed - state.lapStart),
      rider: state.driver === 0 ? "Clutch driving" : "Bramble driving",
      charge: state.driftDirection ? `${state.driftCharge} / 3` : "",
      tell: state.recovery > 0 ? "Back on track" : state.wrongWay ? "Wrong way" :
        state.mode === "glider" ? "GLIDING - pull back to float, forward to dive" :
          state.mode === "air" ? "AIRBORNE" : state.boost > 0 ? "MINI-TURBO!" :
            state.driftCharge === 3 ? "READY - release drift" :
              state.driftDirection ? "DRIFT - steer out, then back in" : state.offRoad ? "Off road" : "",
      countdown: frame.countdown > 0 ? String(Math.ceil(frame.countdown)) : "",
      stats: `${Math.round(frame.fps)} FPS / p95 ${frame.p95.toFixed(1)} ms / ${frame.renderWidth} x ${frame.renderHeight}`,
    };
    for (const [key, value] of Object.entries(values)) {
      const element = node.querySelector<HTMLElement>(`[data-hud="${key}"]`);
      if (element && element.textContent !== value) element.textContent = value;
    }
    node.dataset.charge = String(state.driftCharge);
    node.dataset.flight = String(state.mode === "glider");
    const dot = node.querySelector<SVGCircleElement>("[data-map-dot]");
    dot?.setAttribute("cx", String(mapX(state.x)));
    dot?.setAttribute("cy", String(mapY(state.z)));
  }

  useEffect(() => {
    if (!canvas.current) return;
    let game: GameRuntime | null = null;
    let cancelled = false;
    try {
      game = new GameRuntime(canvas.current, structuredClone(saveRef.current.settings), {
        mode(nextMode, reason) {
          setMode(nextMode);
          if (reason) setPauseReason(reason);
          if (nextMode === "menu" || nextMode === "results") setPanel(null);
        },
        menu: action => actions.current(action),
        device: setDevice,
        warning: setWarning,
        rebound() {
          setRemap(null);
          if (runtime.current) save({ ...saveRef.current, settings: structuredClone(runtime.current.settings) });
        },
        frame: onFrame,
        finished(state) {
          setResult(state);
          const bestLap = Math.min(...state.lapTimes);
          save({
            ...saveRef.current,
            bestLap: Math.min(saveRef.current.bestLap ?? Infinity, bestLap),
            bestRun: Math.min(saveRef.current.bestRun ?? Infinity, state.elapsed),
          });
        },
      });
      runtime.current = game;
      window.__KARTSICK_DIAGNOSTICS__ = { read: () => game!.snapshot() };
      void game.ready().catch(error => {
        if (!cancelled) {
          setFailure(error instanceof Error ? error.message : String(error));
          game?.dispose();
          runtime.current = null;
        }
      });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
    return () => {
      cancelled = true;
      game?.dispose();
      runtime.current = null;
      delete window.__KARTSICK_DIAGNOSTICS__;
    };
  }, []);

  useEffect(() => {
    if (mode === "driving" || mode === "countdown") canvas.current?.focus();
    else document.querySelector<HTMLElement>("[data-menu-root] [data-pad]")?.focus();
  }, [mode, panel]);

  actions.current = action => {
    const current = ui.current;
    if (current.mode === "driving" || current.mode === "countdown") {
      if (action === "pause") runtime.current?.pause();
      return;
    }
    if (action === "back") {
      if (current.panel) { setPanel(null); setRemap(null); }
      else if (current.mode === "paused") runtime.current?.resume();
      return;
    }
    const menu = document.querySelector("[data-menu-root]");
    const controls = Array.from(menu?.querySelectorAll<HTMLButtonElement | HTMLInputElement>("[data-pad]") ?? []).filter(element => !element.disabled);
    if (!controls.length) return;
    const focused = controls.findIndex(element => element === document.activeElement);
    if (action === "accept") {
      const target = controls[Math.max(0, focused)];
      if (target instanceof HTMLButtonElement) target.click();
      return;
    }
    if ((action === "left" || action === "right") && document.activeElement instanceof HTMLInputElement && document.activeElement.type === "range") {
      const target = document.activeElement;
      const next = Math.min(Number(target.max), Math.max(Number(target.min), Number(target.value) + (action === "right" ? 1 : -1) * Number(target.step)));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(target, String(next));
      target.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    const delta = action === "up" || action === "left" ? -1 : 1;
    controls[(focused + delta + controls.length) % controls.length].focus();
  };

  const running = mode === "driving" || mode === "countdown";
  const changeNumber = (key: "master" | "music" | "effects" | "deadzone" | "sensitivity", value: number) => settings({ ...data.settings, [key]: value });
  const toggle = (key: "reducedMotion" | "shake" | "invertPitch") => settings({ ...data.settings, [key]: !data.settings[key] });
  const qualityLevels = ["low", "balanced", "high"] as const;

  function bind(kind: "key", action: KeyAction, name: string): void;
  function bind(kind: "button", action: ButtonAction, name: string): void;
  function bind(kind: "key" | "button", action: KeyAction, name: string): void {
    if (kind === "key") runtime.current?.input.startRemap("key", action);
    else if (action !== "left" && action !== "right") runtime.current?.input.startRemap("button", action);
    setRemap(`${name}: press the new ${kind === "key" ? "key" : "controller button"}. Escape cancels.`);
  }

  return <main className={`game-shell mode-${mode}`} data-panel={panel ?? ""}>
    <canvas ref={canvas} className="race-canvas" tabIndex={-1} aria-label="Butterbell Pastures 3D driving view" />
    <div className="cinema-shade" />

    {warning && <div className="notice" role="alert"><span>{warning}</span><button aria-label="Dismiss notice" onClick={() => setWarning(null)}>Close</button></div>}

    {failure ? <section className="dialog failure" role="alert">
      <p className="eyebrow">The engine could not start</p><h1>Let's get you rolling.</h1><p>{failure}</p>
      <button className="primary" onClick={() => window.location.reload()}>Try again</button>
    </section> : mode === "loading" ? <div className="loading-screen">
      <div className="wordmark">KARTSICK</div><p>Opening the gates at Butterbell...</p><span className="loading-line" />
    </div> : null}

    {mode === "menu" && !panel && <section className="paddock" data-menu-root aria-label="Main menu">
      <div className="edition"><span className="checker" /> THE FIRST DRIVE</div>
      <h1 className="wordmark">KARTSICK</h1>
      <p className="course-title">Good morning,<br /><strong>Butterbell.</strong></p>
      <p className="paddock-copy">A country loop. Two questionable heroes.<br />Your hands on the wheel.</p>
      <button data-pad className="primary drive-button" onClick={() => runtime.current?.start()}><span>Take it for a spin</span><span aria-hidden="true">&#8594;</span></button>
      <div className="secondary-row">
        <button data-pad onClick={() => setPanel("controls")}>How to drive</button>
        <button data-pad onClick={() => setPanel("settings")}>Settings</button>
      </div>
      <p className="device-hint"><span className="connection-dot" />{device}</p>
    </section>}

    {mode === "menu" && !panel && <aside className="build-card" aria-label="Current kart">
      <span className="build-number">01</span><div><p>THE ROAD CREW</p><h2>Clutch + Bramble</h2><span>Boiler Bug / Picnic wheels / Mapwing</span></div>
    </aside>}

    <div ref={hud} className={`hud ${running ? "visible" : ""}`} aria-hidden={!running}>
      <header className="race-top">
        <div className="lap-panel"><span className="hud-label">LAP</span><strong data-hud="lap">1 / 3</strong></div>
        <div className="race-heading"><span className="hud-label">BUTTERBELL PASTURES</span><span>HANDLING STUDY</span></div>
        <div className="time-panel"><span className="hud-label">TOTAL</span><strong data-hud="timer">0:00.000</strong><button tabIndex={running ? 0 : -1} aria-label="Pause race" onClick={() => runtime.current?.pause()}>II</button></div>
      </header>
      <svg className="minimap" viewBox="0 0 215 250" aria-label="Course map. Dashed section is the glide crossing.">
        <polyline points={mapPath} fill="none" stroke="#34456bcc" strokeWidth="12" strokeLinejoin="round" />
        <polyline points={mapPath} fill="none" stroke="#fff0cc" strokeWidth="5" strokeLinejoin="round" />
        <polyline points={gapPath} fill="none" stroke="#f29b70" strokeWidth="5" strokeDasharray="3 4" />
        <circle data-map-dot r="7" fill="#ffd46b" stroke="#34456b" strokeWidth="3" />
      </svg>
      <div className="rider-tag"><span className="tiny-checker" /><span data-hud="rider">Clutch driving</span><span>C / north face to swap</span></div>
      <div className="drift-readout" role="status"><span data-hud="tell" /><strong data-hud="charge" /></div>
      <div className="speed-panel"><strong data-hud="speed">0</strong><span>km/h</span><div>LAP TIME <b data-hud="lapTime">0:00.000</b></div></div>
      <div className="frame-stats" data-hud="stats" />
      <div className="countdown" data-hud="countdown" aria-live="polite" />
    </div>

    {(panel || mode === "paused" || mode === "results") && <div className="modal-scrim">
      <section className={`dialog ${panel === "controls" ? "wide" : ""}`} data-menu-root aria-label={panel ?? mode}>
        {panel ? <button data-pad className="back-button" onClick={() => { setPanel(null); setRemap(null); }}>&#8592; Back</button> : null}
        {panel === "controls" ? <>
          <p className="eyebrow">NO DRIVING ASSISTS. ALL YOU.</p><h2>Find your groove.</h2>
          <div className="control-explainer">
            <article><span>01 / CORNER</span><h3>Hold drift. Turn in.</h3><p>Carry some speed, hold Space or the right shoulder, then steer into the corner.</p></article>
            <article><span>02 / CHARGE</span><h3>Out. In. Repeat.</h3><p>Countersteer out of the turn, then back in. Three outward strokes charge the mini-turbo. The HUD counts each one.</p></article>
            <article><span>03 / RELEASE</span><h3>Blue means go.</h3><p>Release drift at 3 / 3 for a short boost. On the ridge, the Mapwing deploys at the marked ramp. Pull back to float; push forward to dive.</p></article>
          </div>
          {remap && <p className="remap-notice" role="status">{remap}</p>}
          <div className="bindings">
            <section><h3>Keyboard</h3>{keyActions.map(([action, label]) => <button data-pad key={action} className="binding" onClick={() => bind("key", action, label)}><span>{label}</span><kbd>{data.settings.keys[action].replace("Key", "")}</kbd></button>)}</section>
            <section><h3>Controller</h3>{buttonActions.map(([action, label]) => <button data-pad key={action} className="binding" onClick={() => bind("button", action, label)}><span>{label}</span><kbd>{buttonNames[data.settings.buttons[action]] ?? `Button ${data.settings.buttons[action]}`}</kbd></button>)}<p className="muted">Left stick steers and pitches in flight. Menu / Start pauses. South face and east face also accelerate and brake with the default trigger bindings.</p></section>
          </div>
          <button data-pad className="text-button" onClick={() => settings({ ...data.settings, buttons: { ...DEFAULT_SETTINGS.buttons }, keys: { ...DEFAULT_SETTINGS.keys } })}>Restore default bindings</button>
        </> : panel === "settings" ? <>
          <p className="eyebrow">MAKE YOURSELF COMFORTABLE</p><h2>The little adjustments.</h2>
          {([
            ["master", "Master volume", 0, 1, 0.05],
            ["music", "Music", 0, 1, 0.05],
            ["effects", "Engine and effects", 0, 1, 0.05],
            ["deadzone", "Stick dead zone", 0.03, 0.4, 0.01],
            ["sensitivity", "Steering response", 0.6, 1.5, 0.05],
          ] as const).map(([key, label, min, max, step]) => <label className="setting" key={key}><span>{label}<b>{key === "sensitivity" ? `${data.settings[key].toFixed(2)}x` : `${Math.round(data.settings[key] * 100)}%`}</b></span><input data-pad aria-label={label} type="range" min={min} max={max} step={step} value={data.settings[key]} onInput={event => changeNumber(key, Number(event.currentTarget.value))} /></label>)}
          <button data-pad className="setting-toggle" onClick={() => settings({ ...data.settings, quality: qualityLevels[(qualityLevels.indexOf(data.settings.quality) + 1) % qualityLevels.length] })}><span>Render quality</span><b>{data.settings.quality}</b></button>
          {([["reducedMotion", "Reduced motion"], ["shake", "Camera shake"], ["invertPitch", "Invert flight pitch"]] as const).map(([key, label]) => <button data-pad className="setting-toggle" key={key} aria-pressed={data.settings[key]} onClick={() => toggle(key)}><span>{label}</span><b>{data.settings[key] ? "On" : "Off"}</b></button>)}
          <p className="muted">Low reduces resolution and disables shadows. Reduced motion removes decorative camera and scenery motion. These settings never steer or accelerate for you.</p>
        </> : mode === "paused" ? <>
          <p className="eyebrow">PARKED FOR A MOMENT</p><h2>Take a breather.</h2><p>{pauseReason}</p>
          <button data-pad className="primary" onClick={() => runtime.current?.resume()}>Back to the road</button>
          <div className="stacked-actions"><button data-pad onClick={() => setPanel("controls")}>Controls and remapping</button><button data-pad onClick={() => setPanel("settings")}>Settings</button><button data-pad onClick={() => runtime.current?.start()}>Restart the study</button><button data-pad onClick={() => runtime.current?.menu()}>Return to paddock</button></div>
        </> : <>
          <p className="eyebrow">THREE LAPS. NICELY DONE.</p><h2>How did that feel?</h2>
          <div className="result-time">{formatTime(result?.elapsed ?? null)}</div>
          <div className="lap-results">{result?.lapTimes.map((time, index) => <p key={index}><span>Lap {index + 1}</span><strong>{formatTime(time)}</strong></p>)}</div>
          <p className="muted">This is the driving-feedback checkpoint, not the complete game. Steering, countersteer, camera, flight: those are the things to judge.</p>
          <button data-pad className="primary" onClick={() => runtime.current?.start()}>Another three laps</button>
          <button data-pad className="text-button" onClick={() => runtime.current?.menu()}>Return to paddock</button>
        </>}
      </section>
    </div>}
    {mode === "menu" && !panel && <footer className="paddock-footer">
      <span>HANDLING STUDY / ONE KART / NO ITEMS</span>
      <span>BEST LAP <b>{formatTime(data.bestLap)}</b></span>
      <span>Desktop + keyboard or controller <a href="/licenses/" target="_blank" rel="noopener noreferrer">Credits</a></span>
    </footer>}
  </main>;
}

const root = document.getElementById("root");
if (!root) throw new Error("The application root is missing.");
createRoot(root).render(<App />);
