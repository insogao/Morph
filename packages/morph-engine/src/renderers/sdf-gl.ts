/**
 * SDF part-field renderer.
 *
 * Every semantic part is a list of signed-distance primitives evaluated in order.
 * Union / subtract / intersect use polynomial smooth min/max, so a blend radius on
 * a primitive is the "liquid bridge" between it and everything drawn before it.
 * Colour, gloss and translucency are blended with the same weights, so fused material
 * mixes where it joins instead of cross-fading.
 *
 * Pass 1 evaluates the field once per pixel into float targets.
 * Pass 2 reconstructs an inflated height surface from the distance, lights it and
 * adds a soft cast shadow. Output is premultiplied RGBA meant for drawImage.
 */

export type RGB = readonly [number, number, number];
export type Vec2 = readonly [number, number];

export type Shape =
  | { kind: "ellipse"; x: number; y: number; rx: number; ry: number; rotation?: number }
  | { kind: "capsule"; ax: number; ay: number; bx: number; by: number; ra: number; rb: number }
  | { kind: "box"; x: number; y: number; hw: number; hh: number; radius?: number; rotation?: number }
  /** Points p with dot(n, p) < offset are inside. n is normalized by the renderer. */
  | { kind: "halfplane"; nx: number; ny: number; offset: number };

export interface Prim {
  shape: Shape;
  /** How the primitive combines with everything evaluated before it. */
  op?: "union" | "subtract" | "intersect";
  /** Smooth blend radius in world units. 0 is a hard boolean. */
  blend?: number;
  color: RGB;
  /** 0 matte … 1 wet. */
  gloss?: number;
  /** Translucency of thin regions, 0 … 1. */
  sss?: number;
  /** Amount of procedural skin mottling, 0 … 1. */
  mottle?: number;
  /** Local-noise amplitude in world units. Makes edges wobble like liquid. */
  wobble?: number;
  /** Object-space origin for pattern noise so texture travels with the part. */
  anchor?: Vec2;
  /** Decals do not change geometry. They paint colour and an optional bump onto the body. */
  decal?: boolean;
  /** Decal opacity. */
  opacity?: number;
  /** Decal height in world units (positive bulges, negative dents). */
  bump?: number;
}

export interface SdfLook {
  /** Bevel radius of the inflated surface in world units. */
  thickness?: number;
  /** Direction toward the key light; z points to the viewer. Screen y grows downward. */
  light?: readonly [number, number, number];
  keyColor?: RGB;
  ambientTop?: RGB;
  ambientBottom?: RGB;
  rimColor?: RGB;
  sssColor?: RGB;
  /** Cast shadow offset in world units. Omit for no shadow. */
  shadowOffset?: Vec2;
  shadowSoftness?: number;
  shadowOpacity?: number;
  shadowColor?: RGB;
  /** Time used by wobble noise. */
  time?: number;
  seed?: number;
  /** Global alpha of the layer. */
  opacity?: number;
}

export const SDF_MAX_PRIMS = 512;
const TEXELS = 6;

const vertex = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

const common = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uScale;   // pixels per world unit (x,y)
uniform vec2 uOffset;  // pixel position of world origin
uniform float uHeightPx;
vec2 worldAt(vec2 frag) {
  vec2 px = vec2(frag.x, uHeightPx - frag.y);
  return (px - uOffset) / uScale;
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float gnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a0 = hash12(i) * 6.2831853, a1 = hash12(i + vec2(1, 0)) * 6.2831853;
  float a2 = hash12(i + vec2(0, 1)) * 6.2831853, a3 = hash12(i + vec2(1, 1)) * 6.2831853;
  float n0 = dot(vec2(cos(a0), sin(a0)), f), n1 = dot(vec2(cos(a1), sin(a1)), f - vec2(1, 0));
  float n2 = dot(vec2(cos(a2), sin(a2)), f - vec2(0, 1)), n3 = dot(vec2(cos(a3), sin(a3)), f - vec2(1, 1));
  return mix(mix(n0, n1, u.x), mix(n2, n3, u.x), u.y) * .75 + .5;
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
`;

const fieldFragment = common + `
uniform highp sampler2D uPrims;
uniform int uCount;
uniform float uTime;
uniform float uSeed;
uniform float uPixel;  // world units per pixel
layout(location = 0) out vec4 outField;   // d, bump, sss, mottle
layout(location = 1) out vec4 outColor;   // rgb, gloss
layout(location = 2) out vec4 outLocal;   // local xy

float cro(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }
float sdCapsule(vec2 p, vec2 pa, vec2 pb, float ra, float rb) {
  p -= pa; pb -= pa;
  float h = dot(pb, pb);
  float b = ra - rb;
  if (h <= b * b + 1e-4) return min(length(p) - ra, length(p - pb) - rb);
  vec2 q = vec2(dot(p, vec2(pb.y, -pb.x)), dot(p, pb)) / h;
  q.x = abs(q.x);
  vec2 c = vec2(sqrt(h - b * b), b);
  float k = cro(c, q), m = dot(c, q), n = dot(q, q);
  if (k < 0.0) return sqrt(h * n) - ra;
  if (k > c.x) return sqrt(h * (n + 1.0 - 2.0 * q.y)) - rb;
  return m - ra;
}
vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x + s * p.y, -s * p.x + c * p.y); }
float sdEllipse(vec2 p, vec2 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k1 > 0.0 ? k0 * (k0 - 1.0) / k1 : -min(r.x, r.y);
}
float sdBox(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}
float shapeDist(vec2 p, float kind, vec4 a, vec4 b) {
  if (kind < 0.5) return sdEllipse(rot(p - a.xy, b.x), max(a.zw, vec2(1e-3)));
  if (kind < 1.5) return sdCapsule(p, a.xy, a.zw, max(b.x, 0.0), max(b.y, 0.0));
  if (kind < 2.5) return sdBox(rot(p - a.xy, b.x), a.zw, b.y);
  return dot(normalize(a.xy), p) - a.z;
}

void main() {
  vec2 p = worldAt(gl_FragCoord.xy);
  vec2 n = vec2(gnoise(p * .024 + vec2(uSeed, uTime * .55)), gnoise(p * .024 + vec2(uTime * .45, 17.0 + uSeed))) * 2.0 - 1.0;
  float d = 1e5;
  vec3 col = vec3(0);
  float gloss = 0.0, sss = 0.0, mottle = 0.0, bump = 0.0;
  vec2 local = vec2(0);
  bool first = true;
  for (int i = 0; i < ${SDF_MAX_PRIMS}; i++) {
    if (i >= uCount) break;
    vec4 t0 = texelFetch(uPrims, ivec2(0, i), 0); // kind, op, blend, wobble
    vec4 t1 = texelFetch(uPrims, ivec2(1, i), 0);
    vec4 t2 = texelFetch(uPrims, ivec2(2, i), 0);
    vec4 t3 = texelFetch(uPrims, ivec2(3, i), 0); // rgb gloss
    vec4 t4 = texelFetch(uPrims, ivec2(4, i), 0); // sss mottle anchor
    vec4 t5 = texelFetch(uPrims, ivec2(5, i), 0); // bump decal opacity
    float di = shapeDist(p + n * t0.w, t0.x, t1, t2);
    if (t5.y > 0.5) {
      float aa = uPixel * 0.9;
      float m = smoothstep(aa, -aa, di) * t5.z;
      col = mix(col, t3.rgb, m);
      gloss = mix(gloss, t3.a, m);
      float prof = clamp(-di / max(abs(t5.x) * 2.0, 1e-3), 0.0, 1.0);
      bump += t5.x * sqrt(prof) * smoothstep(0.0, -aa, di) * t5.z;
      continue;
    }
    if (first) {
      d = t0.y > 0.5 ? 1e5 : di;
      col = t3.rgb; gloss = t3.a; sss = t4.x; mottle = t4.y; local = p - t4.zw;
      first = false;
      continue;
    }
    float k = max(t0.z, 1e-4);
    if (t0.y < 0.5) {
      float h = clamp(0.5 + 0.5 * (di - d) / k, 0.0, 1.0);
      float nd = mix(di, d, h) - k * h * (1.0 - h);
      col = mix(t3.rgb, col, h); gloss = mix(t3.a, gloss, h);
      sss = mix(t4.x, sss, h); mottle = mix(t4.y, mottle, h); local = mix(p - t4.zw, local, h);
      d = nd;
    } else if (t0.y < 1.5) {
      float h = clamp(0.5 - 0.5 * (d + di) / k, 0.0, 1.0);
      d = mix(d, -di, h) + k * h * (1.0 - h);
    } else {
      float h = clamp(0.5 - 0.5 * (di - d) / k, 0.0, 1.0);
      d = mix(di, d, h) + k * h * (1.0 - h);
    }
  }
  outField = vec4(d, bump, sss, mottle);
  outColor = vec4(col, gloss);
  outLocal = vec4(local, 0, 1);
}`;

const shadeFragment = common + `
uniform highp sampler2D uField;
uniform highp sampler2D uColor;
uniform highp sampler2D uLocal;
uniform float uPixel;
uniform float uThickness;
uniform vec3 uLight;
uniform vec3 uKey, uAmbTop, uAmbBottom, uRim, uSss, uShadowColor;
uniform vec2 uShadowOffset;
uniform float uShadowSoft, uShadowOpacity, uOpacity, uSeed;
out vec4 pixel;

float heightOf(vec4 f) {
  float inside = clamp(-f.x, 0.0, uThickness);
  float t = 1.0 - inside / uThickness;
  return uThickness * sqrt(max(0.0, 1.0 - t * t)) + f.y;
}
vec4 fieldAt(ivec2 c) {
  ivec2 size = textureSize(uField, 0);
  return texelFetch(uField, clamp(c, ivec2(0), size - 1), 0);
}

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 f = fieldAt(c);
  float d = f.x;
  float aa = uPixel * 0.75;
  float cover = smoothstep(aa, -aa, d);

  float shadow = 0.0;
  if (uShadowOpacity > 0.0) {
    vec2 offPx = uShadowOffset * uScale * vec2(1, -1);
    float soft = max(uShadowSoft, 1e-3);
    float acc = 0.0;
    for (int j = 0; j < 9; j++) {
      vec2 o = vec2(float(j % 3) - 1.0, float(j / 3) - 1.0) * soft * 0.5 * uScale.x;
      float sd = fieldAt(c - ivec2(offPx + o)).x;
      acc += smoothstep(soft, -soft, sd);
    }
    shadow = acc / 9.0 * uShadowOpacity;
  }

  if (cover <= 0.0) {
    pixel = vec4(uShadowColor * shadow, shadow) * uOpacity;
    return;
  }

  float h = heightOf(f);
  float hx = heightOf(fieldAt(c + ivec2(1, 0))) - heightOf(fieldAt(c - ivec2(1, 0)));
  float hy = heightOf(fieldAt(c - ivec2(0, 1))) - heightOf(fieldAt(c + ivec2(0, 1)));
  vec3 n = normalize(vec3(-hx / (2.0 * uPixel), -hy / (2.0 * uPixel), 1.0));

  vec4 cg = texelFetch(uColor, c, 0);
  vec2 local = texelFetch(uLocal, c, 0).xy;
  vec3 base = cg.rgb;
  float gloss = cg.a;
  if (f.w > 0.0) {
    mat2 r = mat2(.8, .6, -.6, .8);
    vec2 q = local + 14.0 * vec2(gnoise(local * .02 + uSeed), gnoise(local * .02 - uSeed + 9.0));
    float m = gnoise(q * .032) * .62 + gnoise(r * q * .085 + 3.0) * .28 + gnoise(r * r * q * .2) * .10;
    float spots = smoothstep(.5, .66, m);
    float speck = smoothstep(.72, .8, gnoise(r * local * .26 + 11.0));
    base *= mix(1.0, mix(1.1, .66, spots) + speck * .22, f.w);
  }

  vec3 L = normalize(uLight);
  float wrap = .35;
  float diff = max(0.0, (dot(n, L) + wrap) / (1.0 + wrap));
  vec3 amb = mix(uAmbBottom, uAmbTop, clamp(.5 - .5 * n.y, 0.0, 1.0));
  vec3 col = base * (amb + uKey * diff);

  float thin = 1.0 - clamp(h / uThickness, 0.0, 1.0);
  col += base * uSss * f.z * (thin * thin * .9 + .15 * (1.0 - diff));

  vec3 H = normalize(L + vec3(0, 0, 1));
  float shin = mix(6.0, 160.0, gloss);
  float spec = pow(max(dot(n, H), 0.0), shin) * (.08 + gloss * 1.4);
  float fres = pow(1.0 - n.z, 3.0);
  col += uKey * spec;
  col += uRim * fres * (.15 + .6 * gloss) * clamp(.6 - .4 * n.y, 0.0, 1.0);
  // contact darkening where folds meet: low height close to the silhouette is already lit by sss.
  col = col / (1.0 + col * .18);
  vec3 outc = col * cover + uShadowColor * shadow * (1.0 - cover);
  float a = cover + shadow * (1.0 - cover);
  pixel = vec4(outc, a) * uOpacity;
}`;

function compile(gl: WebGL2RenderingContext, kind: number, source: string) {
  const s = gl.createShader(kind)!;
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error("SDF shader: " + log);
  }
  return s;
}

function link(gl: WebGL2RenderingContext, fragment: string) {
  const program = gl.createProgram()!;
  const v = compile(gl, gl.VERTEX_SHADER, vertex);
  const f = compile(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, v);
  gl.attachShader(program, f);
  gl.linkProgram(program);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("SDF link: " + gl.getProgramInfoLog(program));
  return program;
}

const KIND = { ellipse: 0, capsule: 1, box: 2, halfplane: 3 } as const;
const OP = { union: 0, subtract: 1, intersect: 2 } as const;

/** Pack primitives into the data-texture layout. Exported for tests. */
export function packPrims(prims: readonly Prim[], out = new Float32Array(SDF_MAX_PRIMS * TEXELS * 4)) {
  if (prims.length > SDF_MAX_PRIMS) throw new RangeError("Too many SDF primitives: " + prims.length);
  prims.forEach((prim, i) => {
    const o = i * TEXELS * 4;
    const s = prim.shape;
    const values: number[] = [KIND[s.kind], OP[prim.op ?? "union"], prim.blend ?? 0, prim.wobble ?? 0];
    if (s.kind === "ellipse") values.push(s.x, s.y, s.rx, s.ry, s.rotation ?? 0, 0, 0, 0);
    else if (s.kind === "capsule") values.push(s.ax, s.ay, s.bx, s.by, s.ra, s.rb, 0, 0);
    else if (s.kind === "box") values.push(s.x, s.y, s.hw, s.hh, s.rotation ?? 0, s.radius ?? 0, 0, 0);
    else values.push(s.nx, s.ny, s.offset, 0, 0, 0, 0, 0);
    const anchor = prim.anchor ?? [0, 0];
    values.push(...prim.color, prim.gloss ?? .3, prim.sss ?? 0, prim.mottle ?? 0, anchor[0], anchor[1],
      prim.bump ?? 0, prim.decal ? 1 : 0, prim.opacity ?? 1, 0);
    for (let k = 0; k < values.length; k++) {
      if (!Number.isFinite(values[k])) throw new RangeError("Non-finite SDF primitive value at " + i);
      out[o + k] = values[k];
    }
  });
  return out;
}

/** World-space bounds of all non-halfplane primitives, or null. */
export function primBounds(prims: readonly Prim[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const { shape: s, blend = 0, wobble = 0 } of prims) {
    const pad = blend + wobble;
    if (s.kind === "ellipse") {
      const r = Math.max(s.rx, s.ry) + pad;
      x0 = Math.min(x0, s.x - r); x1 = Math.max(x1, s.x + r); y0 = Math.min(y0, s.y - r); y1 = Math.max(y1, s.y + r);
    } else if (s.kind === "capsule") {
      const r = Math.max(s.ra, s.rb) + pad;
      x0 = Math.min(x0, s.ax - r, s.bx - r); x1 = Math.max(x1, s.ax + r, s.bx + r);
      y0 = Math.min(y0, s.ay - r, s.by - r); y1 = Math.max(y1, s.ay + r, s.by + r);
    } else if (s.kind === "box") {
      const r = Math.hypot(s.hw, s.hh) + pad;
      x0 = Math.min(x0, s.x - r); x1 = Math.max(x1, s.x + r); y0 = Math.min(y0, s.y - r); y1 = Math.max(y1, s.y + r);
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

export interface SdfRenderer {
  readonly canvas: HTMLCanvasElement;
  /** Render primitives into the layer and draw it onto ctx in its current world transform. */
  draw(ctx: CanvasRenderingContext2D, prims: readonly Prim[], look?: SdfLook): void;
  dispose(): void;
}

export function createSdfRenderer(): SdfRenderer {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error("SDF renderer requires WebGL 2.");
  if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("SDF renderer requires EXT_color_buffer_float.");
  const field = link(gl, fieldFragment);
  const shade = link(gl, shadeFragment);
  const data = new Float32Array(SDF_MAX_PRIMS * TEXELS * 4);
  const primTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, primTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TEXELS, SDF_MAX_PRIMS, 0, gl.RGBA, gl.FLOAT, null);
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
  const fbo = gl.createFramebuffer()!;
  const targets = [gl.createTexture()!, gl.createTexture()!, gl.createTexture()!];
  let w = 0, h = 0, disposed = false;
  const U = (program: WebGLProgram, name: string) => gl.getUniformLocation(program, name);

  function resize(width: number, height: number) {
    if (width === w && height === h) return;
    w = width; h = height;
    canvas.width = w; canvas.height = h;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    targets.forEach((tex, i) => {
      gl!.bindTexture(gl!.TEXTURE_2D, tex);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA32F, w, h, 0, gl!.RGBA, gl!.FLOAT, null);
      for (const p of [gl!.TEXTURE_MIN_FILTER, gl!.TEXTURE_MAG_FILTER]) gl!.texParameteri(gl!.TEXTURE_2D, p, gl!.NEAREST);
      gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0 + i, gl!.TEXTURE_2D, tex, 0);
    });
    gl!.drawBuffers([gl!.COLOR_ATTACHMENT0, gl!.COLOR_ATTACHMENT1, gl!.COLOR_ATTACHMENT2]);
    if (gl!.checkFramebufferStatus(gl!.FRAMEBUFFER) !== gl!.FRAMEBUFFER_COMPLETE) throw new Error("SDF framebuffer incomplete.");
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
  }

  return {
    canvas,
    draw(ctx, prims, look = {}) {
      if (disposed) throw new Error("SDF renderer disposed.");
      const geometry = prims.filter(p => !p.decal);
      if (!geometry.length) return;
      const m = ctx.getTransform();
      const scale = Math.hypot(m.a, m.b);
      resize(ctx.canvas.width, ctx.canvas.height);
      packPrims(prims, data);
      gl.bindTexture(gl.TEXTURE_2D, primTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TEXELS, prims.length, gl.RGBA, gl.FLOAT, data);

      // Scissor to the primitives plus shadow reach.
      const b = primBounds(prims)!;
      const so = look.shadowOffset ?? [0, 0];
      const reach = (look.shadowOpacity ? (look.shadowSoftness ?? 8) * 2 : 0) + 4;
      const wx0 = Math.min(b.x0, b.x0 + so[0]) - reach, wx1 = Math.max(b.x1, b.x1 + so[0]) + reach;
      const wy0 = Math.min(b.y0, b.y0 + so[1]) - reach, wy1 = Math.max(b.y1, b.y1 + so[1]) + reach;
      const px0 = Math.max(0, Math.floor(m.e + wx0 * scale)), px1 = Math.min(w, Math.ceil(m.e + wx1 * scale));
      const py0 = Math.max(0, Math.floor(m.f + wy0 * scale)), py1 = Math.min(h, Math.ceil(m.f + wy1 * scale));
      if (px1 <= px0 || py1 <= py0) return;

      gl.viewport(0, 0, w, h);
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearBufferfv(gl.COLOR, 0, [1e5, 0, 0, 0]);
      gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 0]);
      gl.clearBufferfv(gl.COLOR, 2, [0, 0, 0, 0]);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(px0, h - py1, px1 - px0, py1 - py0);
      gl.useProgram(field);
      const common = (program: WebGLProgram) => {
        gl.uniform2f(U(program, "uScale"), scale, scale);
        gl.uniform2f(U(program, "uOffset"), m.e, m.f);
        gl.uniform1f(U(program, "uHeightPx"), h);
        gl.uniform1f(U(program, "uPixel"), 1 / scale);
        gl.uniform1f(U(program, "uSeed"), look.seed ?? 0);
      };
      common(field);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, primTex);
      gl.uniform1i(U(field, "uPrims"), 0);
      gl.uniform1i(U(field, "uCount"), prims.length);
      gl.uniform1f(U(field, "uTime"), look.time ?? 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.SCISSOR_TEST);
      gl.useProgram(shade);
      common(shade);
      ["uField", "uColor", "uLocal"].forEach((name, i) => {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, targets[i]);
        gl.uniform1i(U(shade, name), i);
      });
      const v3 = (name: string, v: readonly number[]) => gl.uniform3f(U(shade, name), v[0], v[1], v[2]);
      gl.uniform1f(U(shade, "uThickness"), look.thickness ?? 22);
      v3("uLight", look.light ?? [-.45, -.6, .66]);
      v3("uKey", look.keyColor ?? [1, .97, .92]);
      v3("uAmbTop", look.ambientTop ?? [.42, .45, .52]);
      v3("uAmbBottom", look.ambientBottom ?? [.16, .14, .16]);
      v3("uRim", look.rimColor ?? [.8, .9, 1]);
      v3("uSss", look.sssColor ?? [1, .45, .3]);
      v3("uShadowColor", look.shadowColor ?? [0, 0, 0]);
      gl.uniform2f(U(shade, "uShadowOffset"), so[0], so[1]);
      gl.uniform1f(U(shade, "uShadowSoft"), look.shadowSoftness ?? 8);
      gl.uniform1f(U(shade, "uShadowOpacity"), look.shadowOpacity ?? 0);
      gl.uniform1f(U(shade, "uOpacity"), look.opacity ?? 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.SCISSOR_TEST);

      ctx.save();
      ctx.resetTransform();
      ctx.drawImage(canvas, 0, 0);
      ctx.restore();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      gl.deleteProgram(field);
      gl.deleteProgram(shade);
      gl.deleteTexture(primTex);
      targets.forEach(t => gl.deleteTexture(t));
      gl.deleteFramebuffer(fbo);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
