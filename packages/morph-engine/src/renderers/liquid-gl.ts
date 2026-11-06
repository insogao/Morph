import type { LiquidMass } from "../effects/liquid";

type RGB = readonly [number, number, number];
type LiquidCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface LiquidPalette {
  readonly deep: RGB;
  readonly light: RGB;
  readonly rim: RGB;
  readonly gloss: number;
  readonly shininess: number;
  readonly grain: number;
  readonly opacity: number;
}

// RGB channels are in the 0–1 display range. Finish parameters only change the material.
export const LIQUID_MATERIALS = {
  ink: { deep: [.029,.090,.083], light: [.114,.251,.204], rim: [.207,.37,.30], gloss: .1, shininess: 16, grain: .065, opacity: 1 },
  water: { deep: [.055,.258,.38], light: [.24,.57,.72], rim: [.65,.93,.98], gloss: .68, shininess: 68, grain: 0, opacity: .68 },
  jelly: { deep: [.29,.04,.18], light: [.82,.21,.50], rim: [.99,.65,.77], gloss: .58, shininess: 41, grain: .018, opacity: .9 },
  metal: { deep: [.075,.10,.15], light: [.51,.61,.69], rim: [.88,.98,1], gloss: .93, shininess: 85, grain: .018, opacity: 1 },
  wax: { deep: [.46,.13,.05], light: [.91,.48,.16], rim: [.98,.77,.47], gloss: .28, shininess: 26, grain: .025, opacity: 1 },
  clay: { deep: [.28,.093,.057], light: [.65,.28,.17], rim: [.78,.52,.35], gloss: .035, shininess: 8, grain: .14, opacity: 1 },
} as const satisfies Record<string, LiquidPalette>;

export type LiquidMaterial = keyof typeof LIQUID_MATERIALS;

export interface LiquidGlOptions {
  /** Top-left corner of the offscreen image in the same world coordinates as the masses. */
  readonly x?: number;
  readonly y?: number;
  readonly width: number;
  readonly height: number;
  readonly iso?: number;
  /** Peak coordinate displacement in world units. Zero uses the unwarped CPU field. */
  readonly distortion?: number;
  readonly seed?: number;
  readonly time?: number;
  readonly material?: LiquidMaterial | LiquidPalette;
}

export interface LiquidGlRenderer<Canvas extends LiquidCanvas = LiquidCanvas> {
  readonly canvas: Canvas;
  /** Redraw an independent frame, then composite it with drawImage at options.x / options.y. */
  render(masses: readonly LiquidMass[], options: LiquidGlOptions): Canvas | null;
  dispose(): void;
}

export const LIQUID_GL_MAX_MASSES = 64;

const vertex = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 uOrigin;
uniform float uHeight;
uniform int uCount;
uniform vec4 uMass[${LIQUID_GL_MAX_MASSES}];
uniform float uStrength[${LIQUID_GL_MAX_MASSES}];
uniform float uIso;
uniform float uTime;
uniform float uSeed;
uniform float uDistortion;
uniform vec3 uDeep;
uniform vec3 uLight;
uniform vec3 uRim;
uniform vec4 uFinish;
out vec4 pixel;

float hash(vec2 point) {
  vec3 h = fract(vec3(point.xyx) * vec3(0.1031, 0.1030, 0.0973) + fract(uSeed * 0.017));
  h += dot(h, h.yzx + 33.33);
  return fract((h.x + h.y) * h.z);
}

float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 t = fract(p);
  t *= t * (3.0 - 2.0 * t);
  return mix(mix(hash(cell), hash(cell + vec2(1,0)), t.x),
             mix(hash(cell + vec2(0,1)), hash(cell + vec2(1,1)), t.x), t.y);
}

void main() {
  vec2 p = uOrigin + vec2(gl_FragCoord.x, uHeight - gl_FragCoord.y);
  vec2 warped = p;
  if (uDistortion > 0.0) {
    vec2 flow = vec2(noise(p * 0.029 + vec2(0.21, 0.14) * uTime),
                     noise(p * 0.027 + vec2(14.2, 5.1) + vec2(-0.18, 0.23) * uTime));
    warped += uDistortion * (flow * 2.0 - 1.0);
  }

  // Same compact squared kernel as liquidPath. The gradient supplies a shading normal only.
  float density = 0.0;
  vec2 derivative = vec2(0.0);
  for (int i = 0; i < ${LIQUID_GL_MAX_MASSES}; i++) {
    if (i >= uCount) break;
    vec4 mass = uMass[i];
    vec2 q = (warped - mass.xy) / mass.zw;
    float support = max(0.0, 1.0 - dot(q, q));
    float strength = uStrength[i];
    density += strength * support * support;
    derivative -= 4.0 * strength * support * q / mass.zw;
  }

  // Threshold and antialiasing do not depend on pigment or finish.
  float edge = max(0.0001, fwidth(density) * 0.65);
  float coverage = smoothstep(uIso - edge, uIso + edge, density);
  if (coverage <= 0.0) discard;
  vec3 normal = normalize(vec3(-derivative * 17.0, 1.0));
  vec3 lamp = normalize(vec3(-0.54, -0.58, 0.61));
  float diffuse = max(0.0, dot(normal, lamp));
  float specular = pow(max(0.0, dot(normal, normalize(lamp + vec3(0,0,1)))), uFinish.y);
  float raised = smoothstep(0.0, 0.60, density - uIso);
  float rim = (1.0 - smoothstep(0.0, 0.18, density - uIso)) * (0.07 + diffuse * 0.29);
  vec3 tone = mix(uDeep, uLight, raised * 0.48 + diffuse * 0.44);
  tone = mix(tone, uRim, rim + specular * uFinish.x);
  tone += (hash(floor(p * 1.6)) - 0.5) * uFinish.z;
  pixel = vec4(clamp(tone, 0.0, 1.0), coverage * uFinish.w);
}`;

function shader(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader {
  const compiled = gl.createShader(kind);
  if (!compiled) throw new Error("Unable to allocate liquid shader.");
  gl.shaderSource(compiled, source);
  gl.compileShader(compiled);
  if (!gl.getShaderParameter(compiled, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(compiled) ?? "Unknown shader error";
    gl.deleteShader(compiled);
    throw new Error(message);
  }
  return compiled;
}

function buildProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to allocate liquid program.");
  const compiled: WebGLShader[] = [];
  try {
    compiled.push(shader(gl, gl.VERTEX_SHADER, vertex));
    compiled.push(shader(gl, gl.FRAGMENT_SHADER, fragment));
    for (const part of compiled) gl.attachShader(program, part);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "Unable to link liquid shader.");
    }
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    for (const part of compiled) gl.deleteShader(part);
  }
}

export function createLiquidGlRenderer(): LiquidGlRenderer<HTMLCanvasElement> | null;
export function createLiquidGlRenderer<Canvas extends LiquidCanvas>(canvas: Canvas): LiquidGlRenderer<Canvas> | null;
/** Returns null when WebGL 2 is unavailable. The CPU contour path can render the same masses. */
export function createLiquidGlRenderer(canvas?: LiquidCanvas): LiquidGlRenderer | null {
  const surface = canvas ?? (typeof document === "undefined" ? undefined : document.createElement("canvas"));
  if (!surface) return null;
  let gl: WebGL2RenderingContext | null;
  try {
    gl = surface.getContext("webgl2", {
      alpha: true, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: true,
    }) as WebGL2RenderingContext | null;
  } catch {
    return null;
  }
  if (!gl) return null;

  const program = buildProgram(gl);
  const uniforms = {
    origin: gl.getUniformLocation(program, "uOrigin"), height: gl.getUniformLocation(program, "uHeight"),
    count: gl.getUniformLocation(program, "uCount"), mass: gl.getUniformLocation(program, "uMass[0]"),
    strength: gl.getUniformLocation(program, "uStrength[0]"), iso: gl.getUniformLocation(program, "uIso"),
    time: gl.getUniformLocation(program, "uTime"), seed: gl.getUniformLocation(program, "uSeed"),
    distortion: gl.getUniformLocation(program, "uDistortion"), deep: gl.getUniformLocation(program, "uDeep"),
    light: gl.getUniformLocation(program, "uLight"), rim: gl.getUniformLocation(program, "uRim"),
    finish: gl.getUniformLocation(program, "uFinish"),
  };
  const [maxWidth,maxHeight] = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  const geometry = new Float32Array(LIQUID_GL_MAX_MASSES * 4);
  const strengths = new Float32Array(LIQUID_GL_MAX_MASSES);
  let disposed = false;

  return {
    canvas: surface,
    render(masses, options) {
      if (disposed || gl.isContextLost()) return null;
      const { width, height, x = 0, y = 0, iso = .36, time = 0, seed = 0, distortion = 0, material = "ink" } = options;
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > maxWidth || height > maxHeight) {
        throw new RangeError("Liquid layer size is outside the WebGL viewport limit.");
      }
      if (![x,y,iso,time,seed,distortion].every(Number.isFinite) || iso <= 0 || distortion < 0) {
        throw new RangeError("Liquid origin, threshold and motion parameters must be finite. Threshold must be positive and distortion non-negative.");
      }
      let count = 0;
      for (const { x: px, y: py, radiusX, radiusY, strength = 1 } of masses) {
        if (![px,py,radiusX,radiusY,strength].every(Number.isFinite)) throw new RangeError("Liquid masses must be finite.");
        if (radiusX <= 0 || radiusY <= 0 || strength <= 0) continue;
        if (count === LIQUID_GL_MAX_MASSES) throw new RangeError("Liquid layer has more than 64 active masses.");
        const offset = count * 4;
        geometry[offset] = px;
        geometry[offset + 1] = py;
        geometry[offset + 2] = radiusX;
        geometry[offset + 3] = radiusY;
        strengths[count++] = strength;
      }

      if (surface.width !== width) surface.width = width;
      if (surface.height !== height) surface.height = height;
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (count === 0) return surface;

      const palette = typeof material === "string" ? LIQUID_MATERIALS[material] : material;
      gl.useProgram(program);
      gl.uniform2f(uniforms.origin, x, y);
      gl.uniform1f(uniforms.height, height);
      gl.uniform1i(uniforms.count, count);
      gl.uniform4fv(uniforms.mass, geometry, 0, count * 4);
      gl.uniform1fv(uniforms.strength, strengths, 0, count);
      gl.uniform1f(uniforms.iso, iso);
      gl.uniform1f(uniforms.time, time);
      gl.uniform1f(uniforms.seed, seed);
      gl.uniform1f(uniforms.distortion, distortion);
      gl.uniform3f(uniforms.deep, ...palette.deep);
      gl.uniform3f(uniforms.light, ...palette.light);
      gl.uniform3f(uniforms.rim, ...palette.rim);
      gl.uniform4f(uniforms.finish, palette.gloss, palette.shininess, palette.grain, palette.opacity);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return surface;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      gl.deleteProgram(program);
      if (!canvas) gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
