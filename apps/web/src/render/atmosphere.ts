import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { RawCubeTexture } from "@babylonjs/core/Materials/Textures/rawCubeTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { Scene } from "@babylonjs/core/scene";
import type { CourseWorld } from "./world-types";

type Environment = NonNullable<CourseWorld["environment"]>;
const SIZE = 32;
export const SUNLIGHT_DIRECTION = new Vector3(.8, 1, -.45).normalize();
const profiles = {
  day: { horizonBlend: .32, cloudStrength: 1, sunStrength: 1 },
  dusk: { horizonBlend: .28, cloudStrength: .65, sunStrength: .4 },
  indoor: { horizonBlend: .08, cloudStrength: 0, sunStrength: 0 },
};

export function reflectionFaces(sky: Color3, ground: Color3, style: Environment["skyStyle"] = "day", mirror = false): Uint8Array[] {
  const profile = profiles[style];
  const sunlight = SUNLIGHT_DIRECTION.multiplyByFloats(mirror ? -1 : 1, 1, 1);
  const horizon = Color3.Lerp(sky, Color3.White(), profile.horizonBlend);
  return Array.from({ length: 6 }, (_, face) => {
    const pixels = new Uint8Array(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const u = (x + .5) / SIZE * 2 - 1, v = (y + .5) / SIZE * 2 - 1;
      const directions = [[1, -v, -u], [-1, -v, u], [u, 1, v], [u, -1, -v], [u, -v, 1], [-u, -v, -1]];
      const direction = Vector3.FromArray(directions[face]).normalize();
      const color = direction.y > 0 ? Color3.Lerp(horizon, sky, Math.sqrt(direction.y))
        : Color3.Lerp(horizon, ground.scale(.55), Math.min(1, -direction.y * 3));
      const highlight = Math.pow(Math.max(0, Vector3.Dot(direction, sunlight)), 80) * .65 * profile.sunStrength;
      const offset = (y * SIZE + x) * 4;
      pixels[offset] = Math.round(Math.min(1, color.r + highlight) * 255);
      pixels[offset + 1] = Math.round(Math.min(1, color.g + highlight * .95) * 255);
      pixels[offset + 2] = Math.round(Math.min(1, color.b + highlight * .8) * 255);
      pixels[offset + 3] = 255;
    }
    return pixels;
  });
}

const vertexSource = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 direction;
void main() {
  direction = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
  gl_Position.z = gl_Position.w * 0.99999;
}`;

const fragmentSource = `
precision highp float;
varying vec3 direction;
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 sunlight;
uniform vec3 sunDirection;
uniform float cloudStrength;
uniform float sunStrength;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),
    mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);
}
float clouds(vec2 p) {
  return noise(p)*.56 + noise(p*2.03+7.1)*.28 + noise(p*4.07-3.4)*.12 + noise(p*8.13)*.04;
}
void main() {
  vec3 ray = normalize(direction);
  float height = max(0.0,ray.y);
  vec3 color = mix(horizon,zenith,pow(height,.42));
  float glow = pow(max(0.0,dot(ray,sunDirection)),24.0);
  color += sunlight * glow * .16 * sunStrength;
  if (ray.y > .015 && cloudStrength > 0.0) {
    vec2 p = ray.xz / (ray.y + .22) * 2.3;
    float density = clouds(p);
    float cover = smoothstep(.55,.63,density) * smoothstep(.015,.14,ray.y);
    float lit = clamp(.62 + (density-clouds(p+sunDirection.xz*.3))*3.8,0.0,1.0);
    vec3 cloud = mix(horizon*.72,mix(vec3(1.0),sunlight,.15)*1.15,lit);
    color = mix(color,cloud,cover*cloudStrength);
  }
  color += sunlight * smoothstep(.9985,.9995,dot(ray,sunDirection)) * 1.4 * sunStrength;
  gl_FragColor = vec4(color,1.0);
}`;

export function makeAtmosphere(scene: Scene, environment: Environment) {
  let mirror = false, current = environment;
  const reflection = new RawCubeTexture(scene,
    reflectionFaces(Color3.FromHexString(environment.sky), Color3.FromHexString(environment.ground), environment.skyStyle),
    SIZE, Constants.TEXTUREFORMAT_RGBA, Constants.TEXTURETYPE_UNSIGNED_BYTE, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  reflection.name = "original sky reflection";
  reflection.coordinatesMode = Texture.CUBIC_MODE;
  scene.environmentTexture = reflection;
  const material = new ShaderMaterial("original cloud sky", scene, { vertexSource, fragmentSource }, {
    attributes: ["position"], uniforms: ["worldViewProjection", "zenith", "horizon", "sunlight", "sunDirection", "cloudStrength", "sunStrength"],
  });
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.fogEnabled = false;
  const dome = MeshBuilder.CreateSphere("sky atmosphere", { diameter: 2, segments: 16 }, scene);
  dome.infiniteDistance = true;
  dome.isPickable = false;
  dome.applyFog = false;
  dome.material = material;
  const apply = (next: Environment) => {
    current = next;
    const sky = Color3.FromHexString(next.sky);
    const profile = profiles[next.skyStyle ?? "day"];
    material.setColor3("zenith", sky.scale(.9).toLinearSpace());
    material.setColor3("horizon", Color3.Lerp(sky, Color3.White(), profile.horizonBlend).toLinearSpace());
    material.setColor3("sunlight", Color3.FromHexString(next.sun).toLinearSpace());
    material.setVector3("sunDirection", SUNLIGHT_DIRECTION.multiplyByFloats(mirror ? -1 : 1, 1, 1));
    material.setFloat("cloudStrength", profile.cloudStrength);
    material.setFloat("sunStrength", profile.sunStrength);
    reflection.update(reflectionFaces(sky, Color3.FromHexString(next.ground), next.skyStyle, mirror),
      Constants.TEXTUREFORMAT_RGBA, Constants.TEXTURETYPE_UNSIGNED_BYTE, false);
  };
  apply(environment);
  return { apply, reflection, dome, setMirror(value: boolean) {
    if (value === mirror) return;
    mirror = value;
    apply(current);
  } };
}
