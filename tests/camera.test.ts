import { describe, expect, it } from "vitest";
import { Camera } from "../src/core/camera";

/** A camera parked at a known spot with no shake, so the maths is checkable by hand. */
function cam(pixelRatio = 1): Camera {
  const c = new Camera(800, 600);
  c.pixelRatio = pixelRatio;
  c.snapTo(1000, 500);
  return c;
}

describe("Camera viewport", () => {
  it("keeps the visible world bounds in logical units", () => {
    const c = cam();
    expect(c.left).toBeCloseTo(600);
    expect(c.top).toBeCloseTo(200);
    expect(c.right).toBeCloseTo(1400);
    expect(c.bottom).toBeCloseTo(800);
  });

  it("shows the same slice of the world at any pixel ratio", () => {
    const low = cam(1);
    const high = cam(3);
    expect(high.left).toBeCloseTo(low.left);
    expect(high.top).toBeCloseTo(low.top);
    expect(high.right).toBeCloseTo(low.right);
    expect(high.bottom).toBeCloseTo(low.bottom);
  });

  it("still narrows the visible bounds when zoomed in", () => {
    const c = cam(2);
    c.zoom = 2;
    expect(c.right - c.left).toBeCloseTo(400);
    expect(c.bottom - c.top).toBeCloseTo(300);
  });
});

describe("Camera projection", () => {
  it("maps world points to backing-store pixels", () => {
    const c = cam(1);
    expect(c.worldToScreen(600, 200)).toEqual({ x: 0, y: 0 });
    expect(c.worldToScreen(1000, 500)).toEqual({ x: 400, y: 300 });
  });

  it("scales screen coordinates by the pixel ratio", () => {
    const c = cam(2);
    // The centre of the world view is the centre of a backing store twice as wide.
    expect(c.worldToScreen(1000, 500)).toEqual({ x: 800, y: 600 });
  });

  it("round-trips world to screen and back at any pixel ratio", () => {
    for (const ratio of [1, 1.5, 2, 3]) {
      const c = cam(ratio);
      const s = c.worldToScreen(1234, 321);
      const w = c.screenToWorld(s.x, s.y);
      expect(w.x).toBeCloseTo(1234);
      expect(w.y).toBeCloseTo(321);
    }
  });

  it("round-trips while zoomed and scaled together", () => {
    const c = cam(2);
    c.zoom = 1.75;
    const s = c.worldToScreen(880, 640);
    const w = c.screenToWorld(s.x, s.y);
    expect(w.x).toBeCloseTo(880);
    expect(w.y).toBeCloseTo(640);
  });

  it("combines zoom and pixel ratio into the draw transform", () => {
    const c = cam(2);
    c.zoom = 1.5;
    expect(c.scale).toBeCloseTo(3);

    const calls: number[][] = [];
    const ctx = { setTransform: (...args: number[]) => void calls.push(args) };
    c.apply(ctx as unknown as CanvasRenderingContext2D);

    expect(calls).toHaveLength(1);
    const [a, b, cc, d, e, f] = calls[0];
    expect(a).toBeCloseTo(3);
    expect(b).toBe(0);
    expect(cc).toBe(0);
    expect(d).toBeCloseTo(3);
    expect(e).toBeCloseTo(-c.left * 3);
    expect(f).toBeCloseTo(-c.top * 3);
  });
});
