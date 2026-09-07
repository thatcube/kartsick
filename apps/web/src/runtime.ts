import { FixedClock, NEUTRAL, copyKart, createKart, stepKart } from "@kartsick/simulation";
import type { KartState } from "@kartsick/simulation";
import { Soundtrack } from "./audio";
import { InputHub } from "./input";
import type { MenuAction } from "./input";
import { StudyScene } from "./render/scene";
import type { Settings } from "./storage";

export type Mode = "loading" | "menu" | "countdown" | "driving" | "paused" | "results";
export interface FrameSnapshot {
  state: KartState;
  countdown: number;
  fps: number;
  p95: number;
  dropped: number;
  renderWidth: number;
  renderHeight: number;
}
export interface RuntimeCallbacks {
  mode: (mode: Mode, reason?: string) => void;
  menu: (action: MenuAction) => void;
  device: (label: string) => void;
  warning: (message: string) => void;
  rebound: () => void;
  frame: (frame: FrameSnapshot) => void;
  finished: (state: KartState) => void;
}

export class GameRuntime {
  readonly view: StudyScene;
  readonly input: InputHub;
  readonly sound: Soundtrack;
  state = createKart();
  previous = copyKart(this.state);
  mode: Mode = "loading";
  settings: Settings;
  countdown = 3.2;
  private pausedFrom: "driving" | "countdown" = "driving";
  private clock = new FixedClock();
  private frameTimes: number[] = [];
  private p95 = 0;
  private lastFrame = performance.now();
  private disposed = false;
  private readonly observer: ResizeObserver;

  constructor(canvas: HTMLCanvasElement, settings: Settings, private readonly callbacks: RuntimeCallbacks) {
    this.settings = settings;
    this.view = new StudyScene(canvas, settings);
    this.sound = new Soundtrack(settings);
    this.input = new InputHub(settings, {
      menu: callbacks.menu, device: callbacks.device, rebound: callbacks.rebound,
      lost: reason => this.pause(reason),
    });
    this.observer = new ResizeObserver(() => this.view.engine.resize());
    this.observer.observe(canvas);
  }

  async ready(): Promise<void> {
    await this.view.scene.whenReadyAsync();
    if (this.disposed) return;
    this.mode = "menu";
    this.callbacks.mode("menu");
    this.lastFrame = performance.now();
    this.view.engine.runRenderLoop(() => this.frame());
  }

  applySettings(settings: Settings): void {
    const qualityChanged = this.settings.quality !== settings.quality;
    this.settings = settings;
    this.input.settings = settings;
    this.sound.settings = settings;
    if (qualityChanged) this.view.applySettings(settings);
  }

  private activateSound(): void {
    void this.sound.activate().catch(error => {
      this.callbacks.warning(`Audio could not start: ${error instanceof Error ? error.message : String(error)}. Driving remains available.`);
    });
  }

  start(): void {
    this.state = createKart();
    this.previous = copyKart(this.state);
    this.clock.reset();
    this.countdown = 3.2;
    this.mode = "countdown";
    this.input.clear();
    this.input.driving = true;
    this.activateSound();
    this.callbacks.mode("countdown");
  }

  pause(reason = "Take a breather."): void {
    if (this.mode !== "driving" && this.mode !== "countdown") return;
    this.pausedFrom = this.mode;
    this.mode = "paused";
    this.input.driving = false;
    this.input.clear();
    this.clock.reset();
    void this.sound.suspend().catch(error => this.callbacks.warning(`Could not suspend audio: ${String(error)}`));
    this.callbacks.mode("paused", reason);
  }

  resume(): void {
    if (this.mode !== "paused") return;
    this.input.clear();
    this.input.driving = true;
    this.mode = this.pausedFrom;
    this.clock.reset();
    this.activateSound();
    this.callbacks.mode(this.mode);
  }

  menu(): void {
    this.mode = "menu";
    this.input.clear();
    this.input.driving = false;
    this.state = createKart();
    this.previous = copyKart(this.state);
    this.clock.reset();
    this.activateSound();
    this.callbacks.mode("menu");
  }

  snapshot(): FrameSnapshot {
    return {
      state: copyKart(this.state), countdown: this.countdown,
      fps: this.view.engine.getFps(), p95: this.p95, dropped: this.clock.droppedSeconds,
      renderWidth: this.view.engine.getRenderWidth(), renderHeight: this.view.engine.getRenderHeight(),
    };
  }

  private frame(): void {
    const now = performance.now();
    const elapsed = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    this.frameTimes.push(elapsed * 1000);
    if (this.frameTimes.length > 240) this.frameTimes.shift();
    if (this.state.tick % 20 === 0) {
      const sorted = [...this.frameTimes].sort((a, b) => a - b);
      this.p95 = sorted[Math.floor((sorted.length - 1) * 0.95)] ?? 0;
    }
    const input = this.input.poll(Math.min(elapsed, 0.05));
    let alpha = 1;
    if (this.mode === "countdown") {
      this.countdown -= Math.min(elapsed, 0.1);
      if (this.countdown <= 0) {
        this.mode = "driving";
        this.callbacks.mode("driving");
        this.clock.reset();
      }
    } else if (this.mode === "driving") {
      alpha = this.clock.advance(elapsed, () => {
        this.previous = copyKart(this.state);
        const events = stepKart(this.state, input);
        for (const event of events) {
          this.sound.event(event);
          if (event.type === "collision" || event.type === "land") this.view.bump();
        }
        if (this.state.recovery > this.previous.recovery) this.previous = copyKart(this.state);
        if (this.state.finished && this.mode !== "results") {
          this.mode = "results";
          this.input.driving = false;
          this.input.clear();
          this.callbacks.finished(copyKart(this.state));
          this.callbacks.mode("results");
        }
      });
    }
    this.sound.update(this.state, this.mode === "driving");
    this.view.render(this.previous, this.state, this.mode === "menu" ? { ...NEUTRAL } : input, alpha, elapsed, this.mode === "menu", this.settings);
    this.callbacks.frame(this.snapshot());
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.view.engine.stopRenderLoop();
    this.observer.disconnect();
    this.input.dispose();
    void this.sound.dispose().catch(error => console.error("Audio shutdown failed.", error));
    this.view.dispose();
  }
}
