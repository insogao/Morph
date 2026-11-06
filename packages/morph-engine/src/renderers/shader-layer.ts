/**
 * Fullscreen fragment-shader layer. Use it for raymarched 3D SDF scenes and other
 * analytic effects that are a pure function of time and uniforms.
 *
 * The fragment shader receives:
 *   uniform vec2 uResolution;  // layer size in pixels
 *   uniform float uTime;
 *   any float / vec2 / vec3 / vec4 uniforms passed to draw().
 * It must declare `out vec4 pixel;` and write premultiplied colour.
 */
export type Uniform = number | readonly [number, number] | readonly [number, number, number] | readonly [number, number, number, number];

export interface ShaderLayer {
  draw(ctx: CanvasRenderingContext2D, time: number, uniforms?: Record<string, Uniform>, options?: { scale?: number; x?: number; y?: number; width?: number; height?: number }): void;
  dispose(): void;
}

const vertex = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

export function createShaderLayer(fragment: string): ShaderLayer {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error("Shader layer requires WebGL 2.");
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("Shader layer: " + gl.getShaderInfoLog(s));
    return s;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Shader layer link: " + gl.getProgramInfoLog(program));
  const locations = new Map<string, WebGLUniformLocation | null>();
  const loc = (name: string) => {
    if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
    return locations.get(name)!;
  };
  let disposed = false;
  return {
    draw(ctx, time, uniforms = {}, options = {}) {
      if (disposed) throw new Error("Shader layer disposed.");
      const m = ctx.getTransform();
      const s = Math.hypot(m.a, m.b);
      const { x = 0, y = 0, width = 1280, height = 720, scale = 1 } = options;
      const w = Math.max(1, Math.round(width * s * scale)), h = Math.max(1, Math.round(height * s * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.useProgram(program);
      gl.uniform2f(loc("uResolution"), w, h);
      gl.uniform1f(loc("uTime"), time);
      for (const [name, v] of Object.entries(uniforms)) {
        const l = loc(name);
        if (typeof v === "number") gl.uniform1f(l, v);
        else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
        else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
        else gl.uniform4f(l, v[0], v[1], v[2], v[3]);
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      ctx.save();
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(canvas, x, y, width, height);
      ctx.restore();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
