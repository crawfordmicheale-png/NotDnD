export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  drag: number;
  gravity: number;
  shape: "dot" | "spark" | "ring";
}

/** Cheap pooled particle system rendered with plain canvas primitives. */
export class ParticleSystem {
  particles: Particle[] = [];
  max = 900;

  emit(p: Omit<Particle, "maxLife">): void {
    if (this.particles.length >= this.max) this.particles.shift();
    this.particles.push({ ...p, maxLife: p.life });
  }

  burst(x: number, y: number, count: number, color: string, speed: number, life = 0.5, size = 3, angle?: number, spread = Math.PI * 2): void {
    for (let i = 0; i < count; i++) {
      const a = angle === undefined ? Math.random() * Math.PI * 2 : angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.emit({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.6),
        size: size * (0.6 + Math.random() * 0.8),
        color,
        drag: 4,
        gravity: 0,
        shape: "dot",
      });
    }
  }

  blood(x: number, y: number, angle: number, amount: number, color = "#8f1d1d"): void {
    this.burst(x, y, amount, color, 220, 0.5, 3, angle, 1.4);
    this.burst(x, y, Math.ceil(amount / 3), "#3a0d0d", 90, 0.9, 4);
  }

  sparks(x: number, y: number, angle: number, amount: number, color = "#ffd27a"): void {
    for (let i = 0; i < amount; i++) {
      const a = angle + (Math.random() - 0.5) * 1.6;
      const s = 200 + Math.random() * 260;
      this.emit({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25 + Math.random() * 0.25, size: 2, color, drag: 6, gravity: 300, shape: "spark" });
    }
  }

  dust(x: number, y: number, amount: number): void {
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 20 + Math.random() * 50;
      this.emit({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 15, life: 0.5 + Math.random() * 0.5, size: 4 + Math.random() * 4, color: "rgba(140,125,110,0.35)", drag: 2, gravity: -10, shape: "dot" });
    }
  }

  ring(x: number, y: number, radius: number, color: string, life = 0.4): void {
    this.emit({ x, y, vx: 0, vy: 0, life, size: radius, color, drag: 0, gravity: 0, shape: "ring" });
  }

  update(dt: number): void {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      p.vy += p.gravity * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.min(1, t * 1.5);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      if (p.shape === "dot") {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + t * 0.5), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === "spark") {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - t) + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}
