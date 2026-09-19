import { Rng } from "./rng";

/** 2D value noise with smooth interpolation, plus fractal Brownian motion. */
export class Noise2D {
  private perm: Uint8Array;
  private grads: Float32Array;

  constructor(seed: number) {
    const rng = new Rng(seed);
    this.perm = new Uint8Array(512);
    const p: number[] = [];
    for (let i = 0; i < 256; i++) p.push(i);
    rng.shuffle(p);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    this.grads = new Float32Array(256);
    for (let i = 0; i < 256; i++) this.grads[i] = rng.next();
  }

  private lattice(ix: number, iy: number): number {
    return this.grads[this.perm[(ix & 255) + this.perm[iy & 255]]];
  }

  /** Returns noise in [0, 1]. */
  value(x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = this.lattice(x0, y0);
    const b = this.lattice(x0 + 1, y0);
    const c = this.lattice(x0, y0 + 1);
    const d = this.lattice(x0 + 1, y0 + 1);
    const top = a + (b - a) * sx;
    const bottom = c + (d - c) * sx;
    return top + (bottom - top) * sy;
  }

  /** Fractal noise in [0, 1]. */
  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.value(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}
