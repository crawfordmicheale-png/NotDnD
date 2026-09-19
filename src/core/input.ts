/** Keyboard + mouse state tracker with per-frame "pressed" edges. */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown: [boolean, boolean, boolean] = [false, false, false];
  mousePressed: [boolean, boolean, boolean] = [false, false, false];
  wheel = 0;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      const code = e.code;
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
      if (["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener("blur", () => {
      this.down.clear();
      this.mouseDown = [false, false, false];
    });
    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = ((e.clientX - rect.left) / rect.width) * canvas.width;
      this.mouseY = ((e.clientY - rect.top) / rect.height) * canvas.height;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button < 3) {
        this.mouseDown[e.button] = true;
        this.mousePressed[e.button] = true;
      }
      e.preventDefault();
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button < 3) this.mouseDown[e.button] = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", (e) => {
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  wasReleased(code: string): boolean {
    return this.released.has(code);
  }

  anyPressed(): boolean {
    return this.pressed.size > 0 || this.mousePressed[0] || this.mousePressed[2];
  }

  /** Consume the current frame's edge events. Call once at the end of each update. */
  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
    this.mousePressed = [false, false, false];
    this.wheel = 0;
  }

  /** Movement axis in [-1, 1] from WASD / arrows. */
  axis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.isDown("KeyA") || this.isDown("ArrowLeft")) x -= 1;
    if (this.isDown("KeyD") || this.isDown("ArrowRight")) x += 1;
    if (this.isDown("KeyW") || this.isDown("ArrowUp")) y -= 1;
    if (this.isDown("KeyS") || this.isDown("ArrowDown")) y += 1;
    return { x, y };
  }
}
