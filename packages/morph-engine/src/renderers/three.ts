import { ACESFilmicToneMapping, NoToneMapping, SRGBColorSpace, WebGLRenderer, type Camera, type Scene } from "three";

export interface LayerBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Draw real 3D geometry inside a seekable Canvas 2D scene. The caller owns its GPU assets. */
export class ThreeLayer {
  private readonly canvas = document.createElement("canvas");
  private readonly renderer: WebGLRenderer;
  private width = 0;
  private height = 0;

  /** flat: no tone mapping, so flat graphic colours come out exactly as authored (card space, title-design looks). */
  constructor(options: { flat?: boolean } = {}) {
    try {
      this.renderer = new WebGLRenderer({
        canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true,
      });
    } catch (error) {
      throw new Error("This scene requires WebGL 2. Enable it in Chromium or use its software renderer.", { cause: error });
    }
    this.renderer.setClearColor(0, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = options.flat ? NoToneMapping : ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = options.flat ? 1 : 1.17;
  }

  composite(context: CanvasRenderingContext2D, scene: Scene, camera: Camera, bounds: LayerBounds) {
    const { a, b } = context.getTransform();
    const ratio = Math.min(2, Math.hypot(a, b));
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    if (this.width !== width || this.height !== height) {
      this.renderer.setSize(width, height, false);
      this.width = width;
      this.height = height;
    }
    this.renderer.render(scene, camera);
    context.drawImage(this.canvas, bounds.x, bounds.y, bounds.width, bounds.height);
  }

  dispose() {
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.width = 1;
    this.canvas.height = 1;
    this.width = 0;
    this.height = 0;
  }
}
