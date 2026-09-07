import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { Scene } from "@babylonjs/core/scene";
import { clamp, surfaceHeight } from "@kartsick/content";
import type { KartState } from "@kartsick/simulation";

const TRAIL_SEGMENTS = 160;
const TRAIL_LIFETIME = 3.5;
const COLORS = [
  new Color4(0.9, 0.85, 0.69, 0.35), new Color4(1, 0.95, 0.78, 0.9),
  new Color4(1, 0.52, 0.22, 1), new Color4(0.35, 0.85, 1, 1),
];
const DUST = new Color4(0.68, 0.6, 0.37, 0.32);

interface TireContact {
  x: number;
  y: number;
  z: number;
  rx: number;
  rz: number;
}

export class DrivingFeedback {
  private readonly texture: DynamicTexture;
  private readonly tires: { side: number; emitter: Vector3; particles: ParticleSystem }[];
  private readonly trail: Mesh;
  private readonly material: StandardMaterial;
  private readonly positions = new Float32Array(TRAIL_SEGMENTS * 12);
  private readonly colors = new Float32Array(TRAIL_SEGMENTS * 16);
  private readonly births = new Float64Array(TRAIL_SEGMENTS).fill(-Infinity);
  private previous: (TireContact | null)[] = [null, null];
  private cursor = 0;
  private lastTick = 0;
  private elapsed = 0;
  private reduced = false;
  private visibleSegments = 0;

  get stats(): { particles: number; marks: number } {
    return {
      particles: this.tires.reduce((count, tire) => count + tire.particles.getActiveCount(), 0),
      marks: this.visibleSegments,
    };
  }

  constructor(scene: Scene) {
    this.texture = new DynamicTexture("original soft tire mote", 32, scene, false);
    const context = this.texture.getContext();
    const glow = context.createRadialGradient(16, 16, 2, 16, 16, 15);
    glow.addColorStop(0, "#ffffffff");
    glow.addColorStop(0.4, "#ffffffd0");
    glow.addColorStop(1, "#ffffff00");
    context.fillStyle = glow;
    context.fillRect(0, 0, 32, 32);
    this.texture.update();
    this.tires = [-1, 1].map(side => {
      const particles = new ParticleSystem("rear tire feedback", 96, scene);
      const emitter = new Vector3();
      particles.emitter = emitter;
      particles.particleTexture = this.texture;
      particles.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      particles.minEmitBox.set(-0.07, 0, -0.07);
      particles.maxEmitBox.set(0.07, 0.05, 0.07);
      particles.minLifeTime = 0.12;
      particles.maxLifeTime = 0.38;
      particles.minEmitPower = 0.5;
      particles.maxEmitPower = 1.2;
      particles.gravity.set(0, -6, 0);
      particles.updateSpeed = 1 / 60;
      particles.emitRate = 0;
      particles.start();
      return { side, emitter, particles };
    });
    this.trail = new Mesh("bounded rear tire marks", scene);
    const data = new VertexData();
    data.positions = this.positions;
    data.colors = this.colors;
    data.normals = Array.from({ length: TRAIL_SEGMENTS * 12 }, (_, i) => i % 3 === 1 ? 1 : 0);
    data.indices = Array.from({ length: TRAIL_SEGMENTS }, (_, i) => {
      const base = i * 4;
      return [base, base + 2, base + 1, base, base + 3, base + 2];
    }).flat();
    data.applyToMesh(this.trail, true);
    this.material = new StandardMaterial("fading rubber", scene);
    this.material.disableLighting = true;
    this.material.emissiveColor = Color3.FromHexString("#4b5b50");
    this.material.specularColor = Color3.Black();
    this.trail.material = this.material;
    this.trail.hasVertexAlpha = true;
    this.trail.isPickable = false;
    this.trail.alwaysSelectAsActiveMesh = true;
    this.trail.setEnabled(false);
  }

  update(state: KartState, position: Vector3, yaw: number, moving: boolean, reducedMotion: boolean): void {
    if (state.elapsed < this.elapsed) {
      this.births.fill(-Infinity);
      this.previous = [null, null];
      this.lastTick = 0;
    }
    this.elapsed = state.elapsed;
    const grounded = moving && state.mode === "ground" && state.recovery === 0 && Math.abs(state.speed) > 6;
    const drifting = grounded && state.driftDirection !== 0 && !state.offRoad;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    for (const { side, emitter, particles } of this.tires) {
      emitter.set(position.x + fz * side * 0.99 - fx * 1.13, position.y - 0.26, position.z - fx * side * 0.99 - fz * 1.13);
      const color = state.offRoad ? DUST : COLORS[state.driftCharge];
      particles.color1.copyFrom(color);
      particles.color2.copyFrom(color);
      particles.colorDead.copyFrom(color);
      particles.colorDead.a = 0;
      particles.minSize = state.offRoad ? 0.2 : 0.07;
      particles.maxSize = state.offRoad ? 0.55 : 0.22;
      particles.direction1.set(-state.vx * 0.06 + side * fz * 0.7, 0.8, -state.vz * 0.06 - side * fx * 0.7);
      particles.direction2.set(-state.vx * 0.12 + side * fz * 1.4, 1.7, -state.vz * 0.12 - side * fx * 1.4);
      particles.emitRate = grounded && !reducedMotion ? state.offRoad ? 28 : drifting ? 45 + state.driftCharge * 18 : 0 : 0;
      if (reducedMotion && !this.reduced) particles.reset();
    }
    this.reduced = reducedMotion;
    if (!drifting || reducedMotion) this.previous = [null, null];
    if (drifting && !reducedMotion && state.tick - this.lastTick >= 3) {
      this.lastTick = state.tick;
      for (let i = 0; i < this.tires.length; i++) {
        const { emitter } = this.tires[i];
        const current: TireContact = {
          x: emitter.x, z: emitter.z, y: surfaceHeight(emitter.x, emitter.z) + 0.047,
          rx: fz * 0.11, rz: -fx * 0.11,
        };
        const previous = this.previous[i];
        if (previous && Math.hypot(current.x - previous.x, current.z - previous.z) < 3) {
          const segment = this.cursor++ % TRAIL_SEGMENTS;
          this.positions.set([
            previous.x - previous.rx, previous.y, previous.z - previous.rz,
            previous.x + previous.rx, previous.y, previous.z + previous.rz,
            current.x + current.rx, current.y, current.z + current.rz,
            current.x - current.rx, current.y, current.z - current.rz,
          ], segment * 12);
          this.births[segment] = state.elapsed;
        }
        this.previous[i] = current;
      }
      this.trail.updateVerticesData("position", this.positions);
    }
    this.visibleSegments = 0;
    for (let i = 0; i < TRAIL_SEGMENTS; i++) {
      const alpha = reducedMotion ? 0 : clamp(1 - (state.elapsed - this.births[i]) / TRAIL_LIFETIME, 0, 1) * 0.32;
      if (alpha > 0) this.visibleSegments++;
      for (let vertex = 0; vertex < 4; vertex++) {
        const offset = i * 16 + vertex * 4;
        this.colors[offset] = this.colors[offset + 1] = this.colors[offset + 2] = 1;
        this.colors[offset + 3] = alpha;
      }
    }
    this.trail.updateVerticesData("color", this.colors);
    this.trail.setEnabled(this.visibleSegments > 0);
  }

  dispose(): void {
    for (const { particles } of this.tires) particles.dispose(false);
    this.texture.dispose();
    this.trail.dispose();
    this.material.dispose();
  }
}
