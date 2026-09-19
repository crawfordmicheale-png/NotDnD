import { damp } from "./math";

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  /**
   * Backing-store pixels per logical pixel. The camera's viewport and all world
   * coordinates stay in logical pixels so that the visible slice of the world
   * does not change with display density; only the resolution we render it at does.
   */
  pixelRatio = 1;
  private shakeAmp = 0;
  private shakeTime = 0;
  shakeX = 0;
  shakeY = 0;

  /** Viewport dimensions are in logical pixels, not backing-store pixels. */
  constructor(public viewW: number, public viewH: number) {}

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  /** World units to backing-store pixels. */
  get scale(): number {
    return this.zoom * this.pixelRatio;
  }

  snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  follow(tx: number, ty: number, dt: number): void {
    this.x = damp(this.x, tx, 8, dt);
    this.y = damp(this.y, ty, 8, dt);
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeTime) * 4;
      this.shakeX = (Math.random() * 2 - 1) * a;
      this.shakeY = (Math.random() * 2 - 1) * a;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  shake(amp: number, time = 0.25): void {
    this.shakeAmp = Math.max(this.shakeAmp * (this.shakeTime > 0 ? 1 : 0), amp);
    this.shakeTime = Math.max(this.shakeTime, time);
  }

  /** World-space bounds of the visible region. */
  get left(): number {
    return this.x - this.viewW / (2 * this.zoom) + this.shakeX;
  }
  get top(): number {
    return this.y - this.viewH / (2 * this.zoom) + this.shakeY;
  }
  get right(): number {
    return this.left + this.viewW / this.zoom;
  }
  get bottom(): number {
    return this.top + this.viewH / this.zoom;
  }

  /** World point to backing-store pixel coordinates. */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const s = this.scale;
    return { x: (wx - this.left) * s, y: (wy - this.top) * s };
  }

  /** Backing-store pixel coordinates back to a world point. */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const s = this.scale;
    return { x: sx / s + this.left, y: sy / s + this.top };
  }

  /** Apply the camera transform so subsequent drawing is in world coordinates. */
  apply(ctx: CanvasRenderingContext2D): void {
    const s = this.scale;
    ctx.setTransform(s, 0, 0, s, -this.left * s, -this.top * s);
  }
}
