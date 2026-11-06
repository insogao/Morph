import type { MorphScene } from "../../packages/morph-engine/src/core/scene";
import { createShaderLayer, type ShaderLayer } from "../../packages/morph-engine/src/renderers/shader-layer";
import { lerp, smooth, smoother, win } from "../../packages/morph-engine/src/effects/skeleton";

/*
 * 3D topology-preserving morph: donut → coffee mug (both genus 1).
 * Raymarched SDF: the donut's ring IS the mug's handle. It stands up, slides aside and
 * thins, while the mug body swells out of the ring's inner edge and fuses with it
 * (smooth union). The cup is then hollowed from the top as a dent, so the hole count never
 * changes. Glaze and sprinkles turn into a ceramic glaze with a dotted band. Coffee pours in.
 */

const fragment = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime, uStand, uRingR, uRingr, uGrow, uHollow, uCoffee, uGlaze, uOrbit, uSpin, uBlend;
uniform vec3 uRingC, uBodyC;
out vec4 pixel;

const float GROUND = -0.58;
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0, -s, 0, 1, 0, s, 0, c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1, 0, 0, 0, c, s, 0, -s, c); }
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float smin(float a, float b, float k, out float h) { h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }
float sdTorus(vec3 p, float R, float r) { return length(vec2(length(p.xz) - R, p.y)) - r; }
float sdCyl(vec3 p, float h, float r, float round) {
  vec2 d = vec2(length(p.xz) - r + round, abs(p.y) - h + round);
  return min(max(d.x, d.y), 0.) + length(max(d, 0.)) - round;
}

// Torus local frame: spins while flat, then stands up into the xy plane.
vec3 ringLocal(vec3 p) {
  vec3 q = p - uRingC;
  q = rotY(-uSpin) * q;
  q = rotX(-uStand * 1.5707963) * q;
  return q;
}

// x: distance, y: material (0 ring, 1 body, 2 coffee, 3 ground), z: ring/body blend
vec3 map(vec3 p) {
  float ring = sdTorus(ringLocal(p), uRingR, uRingr);
  float d = ring, mat = 0., h = 1.;
  if (uGrow > 0.001) {
    vec3 b = p - uBodyC;
    float H = .6 * uGrow, R = .55 * uGrow;
    float body = sdCyl(b, H, R, .06 * uGrow);
    // Hollow from the top: an inner cylinder whose bottom descends.
    if (uHollow > 0.) {
      float depth = uHollow * (2. * H - .1);
      float top = H + .2;
      vec3 c = b - vec3(0, top - (depth + .2) * .5, 0);
      float inner = sdCyl(c, (depth + .2) * .5, R - .055, .05);
      body = max(body, -inner);
    }
    d = smin(ring, body, uBlend, h);
    mat = mix(1., 0., h);
    if (uCoffee > 0.) {
      float level = -H + .1 + uCoffee * (2. * H - .26);
      float coffee = max(length(b.xz) - (R - .06), b.y - level);
      coffee = max(coffee, -(b.y + H - .08));
      if (coffee < d) { d = coffee; mat = 2.; }
    }
  }
  float ground = p.y - GROUND;
  if (ground < d) return vec3(ground, 3., 0.);
  return vec3(d, mat, h);
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(.0015, 0);
  return normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x));
}

float shadow(vec3 ro, vec3 rd) {
  float res = 1., t = .02;
  for (int i = 0; i < 40; i++) {
    float h = map(ro + rd * t).x;
    res = min(res, 10. * h / t);
    t += clamp(h, .02, .2);
    if (res < .001 || t > 4.) break;
  }
  return clamp(res, 0., 1.);
}

float ao(vec3 p, vec3 n) {
  float o = 0., s = 1.;
  for (int i = 1; i <= 5; i++) { float h = .025 * float(i); o += (h - map(p + n * h).x) * s; s *= .7; }
  return clamp(1. - 3.5 * o, 0., 1.);
}

vec3 donutColor(vec3 p, vec3 n) {
  vec3 q = ringLocal(p);
  vec3 dough = vec3(.82, .55, .3);
  // Glaze covers the top half of the ring in its own frame, with a drippy edge.
  float ang = atan(q.z, q.x);
  float edge = .02 + .035 * sin(ang * 9.) + .02 * sin(ang * 23.);
  float glaze = smoothstep(edge - .02, edge + .02, q.y);
  vec3 pink = vec3(.95, .45, .62);
  vec3 c = mix(dough, pink, glaze);
  // Sprinkles: hashed cells on the ring surface.
  float tube = atan(q.y, length(q.xz) - uRingR);
  vec2 cell = floor(vec2(ang * 9., tube * 6.));
  float hsh = hash(cell);
  vec2 f = fract(vec2(ang * 9., tube * 6.)) - .5;
  float a = hsh * 6.28;
  vec2 rf = mat2(cos(a), -sin(a), sin(a), cos(a)) * f;
  float spr = step(abs(rf.x), .28) * step(abs(rf.y), .07) * step(.35, hsh) * glaze;
  vec3 sc = vec3[4](vec3(.98, .9, .3), vec3(.3, .7, .95), vec3(.98, .98, .95), vec3(.4, .85, .45))[int(hsh * 3.99)];
  return mix(c, sc, spr);
}

vec3 mugColor(vec3 p) {
  vec3 b = p - uBodyC;
  vec3 cream = vec3(.93, .91, .86);
  vec3 teal = vec3(.18, .5, .55);
  // Glaze dipped from the top with an uneven line, and a dotted band (the sprinkles' heirs).
  float line = .05 + .04 * sin(atan(b.z, b.x) * 5.) ;
  float dip = smoothstep(line - .015, line + .015, b.y);
  vec3 c = mix(cream, teal, dip);
  float ang = atan(b.z, b.x);
  vec2 cell = vec2(fract(ang * 18. / 6.2831) - .5, (b.y + .22) * 12.);
  float dots = step(length(vec2(cell.x * 2.2, fract(cell.y) - .5)), .26) * step(abs(b.y + .22), .05);
  return mix(c, vec3(.95, .55, .35), dots);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - .5 * uResolution) / uResolution.y;
  float ca = uOrbit;
  vec3 ro = vec3(sin(ca) * 3.3, 1.35, cos(ca) * 3.3);
  vec3 ta = vec3(.12, -.12, 0);
  vec3 ww = normalize(ta - ro), uu = normalize(cross(ww, vec3(0, 1, 0))), vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.7 * ww);

  vec3 bg = mix(vec3(.96, .9, .82), vec3(.78, .7, .62), clamp(uv.y + .6, 0., 1.));
  float t = 0.;
  vec3 hit = vec3(-1);
  for (int i = 0; i < 110; i++) {
    vec3 m = map(ro + rd * t);
    if (m.x < .0008 * t) { hit = vec3(t, m.y, m.z); break; }
    t += m.x * .9;
    if (t > 12.) break;
  }
  vec3 col = bg;
  if (hit.x > 0.) {
    vec3 p = ro + rd * hit.x;
    vec3 n = normalAt(p);
    vec3 L = normalize(vec3(-.6, .9, .5));
    float sh = shadow(p + n * .004, L);
    float occ = ao(p, n);
    float dif = max(dot(n, L), 0.) * sh;
    float sky = .5 + .5 * n.y;
    vec3 base;
    float gloss;
    if (hit.y > 2.5) {
      vec2 g = p.xz;
      base = mix(vec3(.9, .82, .7), vec3(.84, .74, .62), smoothstep(.0, 1., sin(g.x * 3. + sin(g.y * 2.)) * .5 + .5));
      gloss = .05;
    } else if (hit.y > 1.5) {
      base = vec3(.2, .1, .05);
      gloss = 1.;
    } else {
      vec3 ringCol = mix(donutColor(p, n), mugColor(p) * vec3(1, 1, 1), uGlaze);
      base = mix(ringCol, mugColor(p), clamp(hit.y, 0., 1.) * clamp(uGlaze * 1.5, 0., 1.));
      base = mix(base, mix(donutColor(p, n), mugColor(p), uGlaze), 1. - clamp(hit.y, 0., 1.));
      gloss = mix(.35, .8, uGlaze);
    }
    vec3 H = normalize(L - rd);
    float spec = pow(max(dot(n, H), 0.), mix(12., 120., gloss)) * gloss * sh;
    float fres = pow(1. - max(dot(n, -rd), 0.), 4.);
    col = base * (vec3(1., .95, .88) * dif * 1.05 + vec3(.55, .58, .66) * sky * .55 * occ);
    col += vec3(1) * spec * 1.2 + vec3(.9, .92, 1.) * fres * gloss * .35 * occ;
    col = mix(col, bg, smoothstep(5., 9., hit.x));
  }
  col = pow(col, vec3(.95));
  col *= 1. - .25 * dot(uv, uv);
  pixel = vec4(col, 1.);
}`;

let layer: ShaderLayer | null = null;

function state(t: number) {
  const stand = smoother((t - 1.1) / 1.2);
  const move = smoother((t - 1.4) / 1.6);
  const grow = smoother((t - 2.3) / 2.1);
  const ringR = lerp(.62, .26, smoother((t - 1.6) / 2.6));
  const ringr = lerp(.27, .075, smoother((t - 1.8) / 2.6));
  // The body is born on the ring's inner edge and walks to its final centre.
  const ringC: [number, number, number] = [lerp(0, .78, move), lerp(GROUND_Y + .27, .05, stand), 0];
  const birth: [number, number, number] = [ringC[0] - ringR - ringr * .6, ringC[1] - .1, .1];
  const bodyC: [number, number, number] = [lerp(birth[0], 0, smooth(grow * 1.2)), lerp(birth[1], .02, grow), lerp(birth[2], 0, grow)];
  return {
    uStand: stand, uRingR: ringR, uRingr: ringr, uGrow: grow,
    uHollow: smoother((t - 4.1) / 1.0), uCoffee: smoother((t - 5.2) / 1.1), uGlaze: smoother((t - 2.4) / 2.0),
    uBlend: lerp(.28, .045, smoother((t - 2.4) / 2.4)),
    uOrbit: .55 - .5 * smooth(t / 7.5) + .06 * Math.sin(t * .7),
    uSpin: (1 - stand) * t * 1.1,
    uRingC: ringC, uBodyC: bodyC,
  };
}
const GROUND_Y = -.58;

function steam(ctx: CanvasRenderingContext2D, t: number) {
  const s = win(t, 5.9, 6.6);
  if (s <= 0) return;
  ctx.save();
  ctx.globalAlpha = s * .5;
  ctx.strokeStyle = "#ffffff";
  ctx.lineCap = "round";
  for (let k = 0; k < 3; k++) {
    ctx.lineWidth = 6 - k;
    ctx.beginPath();
    for (let i = 0; i <= 30; i++) {
      const u = i / 30;
      const x = 610 + k * 26 + Math.sin(u * 7 + t * 2.4 + k * 2) * 12 * u;
      const y = 236 - u * 150 * s;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export const scene: MorphScene = {
  id: "donut-mug",
  title: "Lab · 3D 拓扑同胚（甜甜圈 → 咖啡杯）",
  duration: 7.5,
  draw(ctx, t) {
    layer ??= createShaderLayer(fragment);
    layer.draw(ctx, t, state(t), { scale: .75 });
    steam(ctx, t);
    ctx.fillStyle = "#5a4636aa";
    ctx.font = "11px ui-monospace, Menlo, monospace";
    ctx.fillText("LAB  /  3D SDF · GENUS-1 MORPH   甜甜圈 → 咖啡杯", 44, 50);
  },
};
