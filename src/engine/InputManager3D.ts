/**
 * Framework-agnostic input manager for keyboard + mouse.
 * No Phaser dependency — pure DOM events.
 */
export interface InputState3D {
  moveX: number;      // -1..1
  moveZ: number;      // -1..1  (forward/back in 3D)
  interact: boolean;
  attack: boolean;
  openInventory: boolean;
  pause: boolean;
  openMap: boolean;
  switchWeapon: boolean;
  speedUp: boolean;
  speedDown: boolean;
  mouseX: number;     // screen space
  mouseY: number;
  mouseDown: boolean;
  mouseJustPressed: boolean;
}

export class InputManager3D {
  public state: InputState3D;

  private keys = new Set<string>();
  private keysJustDown = new Set<string>();
  private prevKeys = new Set<string>();

  private _mouseX = 0;
  private _mouseY = 0;
  private _mouseDown = false;
  private _prevMouseDown = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.state = InputManager3D.empty();
    this.bindEvents();
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    this.canvas.addEventListener('mousemove', (e) => {
      this._mouseX = e.clientX;
      this._mouseY = e.clientY;
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this._mouseDown = true;
    });
    this.canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._mouseDown = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  public update(): void {
    // Detect just-pressed keys
    this.keysJustDown.clear();
    for (const k of this.keys) {
      if (!this.prevKeys.has(k)) this.keysJustDown.add(k);
    }
    this.prevKeys = new Set(this.keys);

    const s = this.state;
    s.moveX = 0;
    s.moveZ = 0;

    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) s.moveX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) s.moveX += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) s.moveZ -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) s.moveZ += 1;

    s.interact = this.keysJustDown.has('KeyE');
    s.attack = this.keysJustDown.has('Space');
    s.openInventory = this.keysJustDown.has('Tab');
    s.pause = this.keysJustDown.has('Escape');
    s.openMap = this.keysJustDown.has('KeyM');
    s.switchWeapon = this.keysJustDown.has('KeyQ');
    s.speedUp = this.keysJustDown.has('Equal');
    s.speedDown = this.keysJustDown.has('Minus');

    s.mouseX = this._mouseX;
    s.mouseY = this._mouseY;
    s.mouseJustPressed = this._mouseDown && !this._prevMouseDown;
    s.mouseDown = this._mouseDown;
    this._prevMouseDown = this._mouseDown;
  }

  public isKeyJustDown(code: string): boolean {
    return this.keysJustDown.has(code);
  }

  public static empty(): InputState3D {
    return {
      moveX: 0, moveZ: 0, interact: false, attack: false,
      openInventory: false, pause: false, openMap: false,
      switchWeapon: false, speedUp: false, speedDown: false,
      mouseX: 0, mouseY: 0, mouseDown: false, mouseJustPressed: false,
    };
  }
}
